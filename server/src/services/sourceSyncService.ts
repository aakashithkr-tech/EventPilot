import { ConnectedSource, IConnectedSource } from '../models/ConnectedSource';
import { Event } from '../models/Event';
import { Deadline } from '../models/Deadline';
import { EventUpdate } from '../models/EventUpdate';
import { Notification } from '../models/Notification';
import { analyzeEventSource } from './eventAnalysisService';
import { decryptSecret } from '../utils/secretBox';
import { env } from '../config/env';
import { loadAuthorizedEvent } from '../utils/eventAccess';
import { recalculateAndPersistPlanner } from './plannerService';
import { Types } from 'mongoose';

interface GmailTokenResponse { access_token: string; expires_in: number; }
interface GmailMessage { id: string; threadId?: string; payload?: any; internalDate?: string; }

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function messageMatchesEvent(text: string, event: any, source: IConnectedSource): boolean {
  const haystack = normalize(text);
  const configured = source.matchKeywords.map(normalize).filter(Boolean);
  const eventWords = normalize(event.name).split(' ').filter((w: string) => w.length >= 3);
  const keywordHits = configured.filter((w) => haystack.includes(w)).length;
  const eventHits = eventWords.filter((w: string) => haystack.includes(w)).length;
  const domain = event.websiteUrl ? (() => { try { return new URL(event.websiteUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '';
  const domainHit = domain ? haystack.includes(normalize(domain)) || haystack.includes(domain.split('.')[0]) : false;
  const senderAllowed = source.senderEmails.length === 0;
  return senderAllowed
    ? keywordHits > 0 || eventHits >= Math.min(3, Math.max(1, eventWords.length)) || domainHit
    : keywordHits > 0 || eventHits >= 2 || domainHit;
}

function headerValue(headers: any[] = [], name: string): string {
  return headers.find((h) => String(h.name).toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function collectParts(payload: any, out: string[]): void {
  if (!payload) return;
  if (payload.body?.data) out.push(decodeBase64Url(payload.body.data));
  for (const part of payload.parts || []) collectParts(part, out);
}

function stripQuotedMail(text: string): string {
  return text
    .split(/\nOn .*wrote:\n|\nFrom: .*\nSent: .*\nTo: .*\nSubject: /i)[0]
    .replace(/^>.*$/gm, '')
    .trim();
}

async function gmailRequest<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Gmail API ${response.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : ({} as T);
}

async function refreshGmailAccessToken(refreshToken: string): Promise<string> {
  if (!env.gmailClientId || !env.gmailClientSecret) throw new Error('Gmail OAuth is not configured on the server.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.gmailClientId,
      client_secret: env.gmailClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Google token refresh failed (${response.status}).`);
  const data = JSON.parse(body) as GmailTokenResponse;
  return data.access_token;
}

async function getGmailMessageText(messageId: string, accessToken: string): Promise<{ subject: string; from: string; date?: Date; text: string }> {
  const message = await gmailRequest<GmailMessage>(`messages/${encodeURIComponent(messageId)}?format=full`, accessToken);
  const headers = message.payload?.headers || [];
  const chunks: string[] = [];
  collectParts(message.payload, chunks);
  return {
    subject: headerValue(headers, 'Subject'),
    from: headerValue(headers, 'From'),
    date: message.internalDate ? new Date(Number(message.internalDate)) : undefined,
    text: stripQuotedMail(chunks.join('\n').replace(/<[^>]+>/g, ' ')).slice(0, 20000),
  };
}

function sourceKeywords(event: any): string[] {
  const domain = event.websiteUrl ? (() => { try { return new URL(event.websiteUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '';
  return [event.name, domain, event.name.split(/\s+/).slice(0, 4).join(' ')].filter(Boolean);
}

async function applyAnalysisToEvent(event: any, source: IConnectedSource, analysisText: string, messageId: string) {
  const result = await analyzeEventSource(analysisText);
  const matchingDeadlines = result.deadlines;
  if (matchingDeadlines.length === 0) return 0;

  let changes = 0;
  for (const incoming of matchingDeadlines) {
    const normalizedTitle = normalize(incoming.title);
    const existing = await Deadline.find({ eventId: event._id, type: 'official' }).sort({ date: 1 });
    const same = existing.find((d) => normalize(d.title) === normalizedTitle ||
      (normalizedTitle.includes('submission') && normalize(d.title).includes('submission')) ||
      (normalizedTitle.includes('registration') && normalize(d.title).includes('registration')));

    if (!same) {
      await Deadline.create({
        eventId: event._id,
        createdBy: event.ownerId,
        title: incoming.title,
        date: new Date(incoming.date),
        type: 'official',
        verified: true,
      });
      await EventUpdate.create({
        eventId: event._id,
        createdBy: event.ownerId,
        type: 'deadline-change',
        title: 'New deadline detected',
        description: `${incoming.title} was detected from a connected event source.`,
        metadata: { newValue: incoming.date },
      });
      if (/final|submission|deadline|closing|last/i.test(incoming.title)) {
        const currentFinal = event.finalDeadline.getTime();
        const incomingFinal = new Date(incoming.date).getTime();
        if (incomingFinal > currentFinal) { event.finalDeadline = new Date(incoming.date); await event.save(); }
      }
      changes++;
      continue;
    }

    const oldDate = same.date.toISOString().slice(0, 10);
    if (oldDate !== incoming.date) {
      same.date = new Date(incoming.date);
      same.verified = true;
      await same.save();
      if (/final|submission|deadline|closing|last/i.test(same.title)) {
        event.finalDeadline = new Date(incoming.date);
        await event.save();
      }
      await EventUpdate.create({
        eventId: event._id,
        createdBy: event.ownerId,
        type: 'deadline-change',
        title: 'Deadline updated from connected source',
        description: `${same.title} changed from ${oldDate} to ${incoming.date}. Source message ${messageId} was matched to this event.`,
        metadata: { oldValue: oldDate, newValue: incoming.date },
      });
      const memberIds = new Set<string>([event.ownerId.toString(), ...(event.members || []).map((m: any) => m.toString())]);
      for (const userId of memberIds) {
        await Notification.create({
          userId: new Types.ObjectId(userId),
          eventId: event._id,
          title: 'Deadline Updated',
          message: `${event.name}: ${same.title} moved from ${oldDate} to ${incoming.date}. Your preparation plan should be recalculated.`,
          type: 'warning',
        });
      }
      changes++;
    }
  }

  if (changes > 0) {
    await recalculateAndPersistPlanner(event._id.toString(), event.ownerId.toString());
  }

  return changes;
}

export async function syncGmailSource(sourceId: string, requestedUserId?: string): Promise<{ messagesChecked: number; matched: number; changes: number }> {
  const source = await ConnectedSource.findById(sourceId).select('+encryptedRefreshToken');
  if (!source || source.type !== 'gmail') throw new Error('Gmail source not found.');
  if (requestedUserId && source.userId.toString() !== requestedUserId) throw new Error('Source not found.');
  if (source.status !== 'active') throw new Error('This source is not active.');

  const event = await Event.findById(source.eventId);
  if (!event) throw new Error('Event not found.');

  const accessToken = await refreshGmailAccessToken(decryptSecret(source.encryptedRefreshToken || ''));
  const terms = source.matchKeywords.length ? source.matchKeywords : sourceKeywords(event);
  const query = `{${terms.slice(0, 4).map((v) => `"${v.replace(/"/g, '')}"`).join(' ')}} newer_than:90d`;
  const list = await gmailRequest<{ messages?: { id: string }[] }>(`messages?q=${encodeURIComponent(query)}&maxResults=25`, accessToken);

  let checked = 0, matched = 0, changes = 0;
  for (const item of list.messages || []) {
    checked++;
    try {
      const message = await getGmailMessageText(item.id, accessToken);
      const sender = message.from.match(/<([^>]+)>/)?.[1] || message.from;
      if (source.senderEmails.length && !source.senderEmails.includes(sender.toLowerCase())) continue;
      const combined = `${message.subject}\n${message.text}`;
      if (!messageMatchesEvent(combined, event, source)) continue;
      matched++;
      changes += await applyAnalysisToEvent(event, source, combined, item.id);
      if (message.date && (!source.lastMessageAt || message.date > source.lastMessageAt)) source.lastMessageAt = message.date;
    } catch (err) {
      // A single malformed/unsupported message must not abort the whole event sync.
      console.warn('[sources] Gmail message skipped:', err instanceof Error ? err.message : err);
    }
  }

  source.lastSyncedAt = new Date();
  source.lastError = undefined;
  await source.save();
  return { messagesChecked: checked, matched, changes };
}

export async function syncAllGmailSources(): Promise<void> {
  const sources = await ConnectedSource.find({ type: 'gmail', status: 'active' }).select('+encryptedRefreshToken');
  for (const source of sources) {
    try {
      await syncGmailSource(source._id.toString());
    } catch (err) {
      source.status = 'error';
      source.lastError = err instanceof Error ? err.message.slice(0, 500) : 'Source sync failed';
      await source.save();
      console.warn(`[sources] Gmail sync failed for ${source._id}:`, source.lastError);
    }
  }
}

export function startSourcePolling() {
  // Email is polled because Gmail's history/watch infrastructure requires a
  // public webhook/Pub/Sub deployment. This local-friendly poller still gives
  // EventPilot continuous updates while keeping each query event-scoped.
  setTimeout(() => { void syncAllGmailSources(); }, 30_000);
  setInterval(() => { void syncAllGmailSources(); }, 15 * 60 * 1000);
}

export async function assertAuthorizedSource(eventId: string, sourceId: string, userId: string) {
  const event = await loadAuthorizedEvent(eventId, userId);
  const source = await ConnectedSource.findOne({ _id: sourceId, eventId: event._id, userId });
  if (!source) throw new Error('Connected source not found.');
  return { event, source };
}
