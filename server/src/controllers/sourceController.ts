import { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ConnectedSource } from '../models/ConnectedSource';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent } from '../utils/eventAccess';
import { env } from '../config/env';
import { encryptSecret } from '../utils/secretBox';
import { syncGmailSource } from '../services/sourceSyncService';

function requireWhatsAppConfig() {
  if (!env.whatsappVerifyToken || !env.whatsappPhoneNumberId || !env.whatsappAccessToken || !env.whatsappAppSecret) {
    throw new AppError('WhatsApp Business integration is not fully configured on this EventPilot server yet.', 503, 'INTEGRATION_NOT_CONFIGURED');
  }
}

function requireGmailConfig() {
  if (!env.gmailClientId || !env.gmailClientSecret) {
    throw new AppError('Gmail connection is not configured on this EventPilot server yet.', 503, 'INTEGRATION_NOT_CONFIGURED');
  }
}

export const listEventSources = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const sources = await ConnectedSource.find({ eventId: event._id, userId: req.userId }).sort({ createdAt: -1 });
  res.json({ success: true, data: { sources: sources.map((s) => s.toJSON()) } });
});

export const startGmailConnect = asyncHandler(async (req: AuthedRequest, res: Response) => {
  requireGmailConfig();
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const state = jwt.sign({ purpose: 'gmail-connect', userId: req.userId, eventId: event._id.toString(), nonce: crypto.randomBytes(12).toString('hex') }, env.jwtSecret, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: env.gmailClientId!,
    redirect_uri: env.gmailRedirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    state,
  });
  res.json({ success: true, data: { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` } });
});

export const gmailCallback = asyncHandler(async (req: any, res: Response) => {
  requireGmailConfig();
  const { code, state, error } = req.query || {};
  if (error) return res.redirect(`${env.clientUrl}/?source_error=${encodeURIComponent(String(error))}`);
  if (!code || !state) throw new AppError('Invalid Gmail OAuth callback.', 400, 'OAUTH_INVALID');

  let payload: any;
  try { payload = jwt.verify(String(state), env.jwtSecret); } catch { throw new AppError('Expired or invalid Gmail connection request.', 400, 'OAUTH_INVALID'); }
  if (payload?.purpose !== 'gmail-connect' || !payload?.userId || !payload?.eventId) throw new AppError('Invalid Gmail connection request.', 400, 'OAUTH_INVALID');

  const event = await loadAuthorizedEvent(String(payload.eventId), String(payload.userId));
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code),
      client_id: env.gmailClientId!,
      client_secret: env.gmailClientSecret!,
      redirect_uri: env.gmailRedirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenBody = await tokenResponse.text();
  if (!tokenResponse.ok) throw new AppError('Google authorization could not be completed.', 422, 'OAUTH_FAILED');
  const tokens = JSON.parse(tokenBody);
  if (!tokens.refresh_token) throw new AppError('Google did not return a refresh token. Disconnect EventPilot from Google and try connecting again.', 422, 'OAUTH_NO_REFRESH_TOKEN');

  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await profileResponse.json() as { emailAddress?: string };
  const displayName = profile.emailAddress || 'Connected Gmail';

  const keywords = [event.name];
  if (event.websiteUrl) { try { keywords.push(new URL(event.websiteUrl).hostname.replace(/^www\./, '')); } catch {} }

  await ConnectedSource.findOneAndUpdate(
    { eventId: event._id, userId: payload.userId, type: 'gmail', displayName },
    {
      eventId: event._id,
      userId: payload.userId,
      type: 'gmail',
      status: 'active',
      displayName,
      externalId: displayName,
      encryptedRefreshToken: encryptSecret(tokens.refresh_token),
      senderEmails: [],
      matchKeywords: keywords,
      lastError: undefined,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.redirect(`${env.clientUrl}/?source_connected=gmail&eventId=${event._id.toString()}`);
});


export const createWhatsAppSource = asyncHandler(async (req: AuthedRequest, res: Response) => {
  requireWhatsAppConfig();
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const rawKeywords = Array.isArray(req.body?.keywords) ? req.body.keywords : [event.name];
  const keywords = [...new Set(rawKeywords.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean))].slice(0, 10);
  if (!keywords.length) throw new AppError('At least one event matching keyword is required.', 400, 'VALIDATION_ERROR');
  const source = await ConnectedSource.findOneAndUpdate(
    { eventId: event._id, userId: req.userId, type: 'whatsapp', externalId: env.whatsappPhoneNumberId },
    {
      eventId: event._id,
      userId: req.userId,
      type: 'whatsapp',
      status: 'active',
      displayName: 'WhatsApp Business channel',
      externalId: env.whatsappPhoneNumberId,
      senderEmails: [],
      matchKeywords: keywords,
      lastError: undefined,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ success: true, data: { source: source.toJSON() } });
});

export const syncEventSource = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const source = await ConnectedSource.findOne({ _id: req.params.sourceId, eventId: event._id, userId: req.userId });
  if (!source) throw new AppError('Connected source not found.', 404, 'NOT_FOUND');
  if (source.type !== 'gmail') throw new AppError('Manual sync is currently available for Gmail sources.', 400, 'UNSUPPORTED_SOURCE');
  const result = await syncGmailSource(source._id.toString(), req.userId);
  res.json({ success: true, data: { result } });
});

export const disconnectEventSource = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const source = await ConnectedSource.findOne({ _id: req.params.sourceId, eventId: event._id, userId: req.userId });
  if (!source) throw new AppError('Connected source not found.', 404, 'NOT_FOUND');
  source.status = 'revoked';
  source.encryptedRefreshToken = undefined;
  await source.save();
  res.json({ success: true, data: null });
});
