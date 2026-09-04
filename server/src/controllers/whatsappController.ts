import { Request, Response } from 'express';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { ConnectedSource } from '../models/ConnectedSource';
import { Event } from '../models/Event';
import { EventUpdate } from '../models/EventUpdate';
import { Deadline } from '../models/Deadline';
import { Notification } from '../models/Notification';
import { env } from '../config/env';
import { analyzeEventSource } from '../services/eventAnalysisService';
import { recalculateAndPersistPlanner } from '../services/plannerService';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function signatureMatches(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function extractMessageText(message: any): string {
  return String(
    message?.text?.body ||
    message?.button?.text ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.list_reply?.title ||
    ''
  ).trim();
}

function scoreEvent(text: string, event: any, source: any): number {
  const haystack = normalize(text);
  const keywords = (source.matchKeywords || []).map(normalize).filter(Boolean);
  const eventWords = normalize(event.name).split(' ').filter((word: string) => word.length >= 3);
  const keywordHits = keywords.filter((keyword: string) => haystack.includes(keyword)).length;
  const eventHits = eventWords.filter((word: string) => haystack.includes(word)).length;
  const domain = event.websiteUrl
    ? (() => {
        try { return new URL(event.websiteUrl).hostname.replace(/^www\./, ''); } catch { return ''; }
      })()
    : '';
  const domainHit = domain ? haystack.includes(normalize(domain)) || haystack.includes(domain.split('.')[0]) : false;
  return keywordHits * 10 + eventHits + (domainHit ? 5 : 0);
}

async function applyWhatsAppMessage(event: any, source: any, text: string, messageId: string): Promise<number> {
  const result = await analyzeEventSource(`${event.name}\n${text}`);
  if (!result.deadlines.length) return 0;

  let changes = 0;
  for (const incoming of result.deadlines) {
    const incomingDate = new Date(incoming.date);
    if (Number.isNaN(incomingDate.getTime())) continue;

    const normalizedTitle = normalize(incoming.title);
    const existing = await Deadline.find({ eventId: event._id, type: 'official' });
    const same = existing.find((deadline) => {
      const title = normalize(deadline.title);
      return title === normalizedTitle ||
        (normalizedTitle.includes('submission') && title.includes('submission')) ||
        (normalizedTitle.includes('registration') && title.includes('registration'));
    });

    if (!same) {
      await Deadline.create({
        eventId: event._id,
        createdBy: event.ownerId,
        title: incoming.title,
        date: incomingDate,
        type: 'official',
        verified: true,
      });

      await EventUpdate.create({
        eventId: event._id,
        createdBy: event.ownerId,
        type: 'deadline-change',
        title: 'New deadline detected on WhatsApp',
        description: `${incoming.title} was detected from a verified WhatsApp event message.`,
        metadata: { newValue: incoming.date, source: 'whatsapp', messageId },
      });
      changes++;
      continue;
    }

    const oldDate = same.date.toISOString().slice(0, 10);
    const newDate = incomingDate.toISOString().slice(0, 10);
    if (oldDate === newDate) continue;

    same.date = incomingDate;
    same.verified = true;
    await same.save();

    await EventUpdate.create({
      eventId: event._id,
      createdBy: event.ownerId,
      type: 'deadline-change',
      title: 'WhatsApp deadline update detected',
      description: `${same.title} changed from ${oldDate} to ${newDate}.`,
      metadata: { oldValue: oldDate, newValue: newDate, source: 'whatsapp', messageId },
    });

    const memberIds = new Set<string>([
      event.ownerId.toString(),
      ...(event.members || []).map((member: any) => member.toString()),
    ]);
    for (const userId of memberIds) {
      await Notification.create({
        userId: new Types.ObjectId(userId),
        eventId: event._id,
        title: 'Deadline Updated from WhatsApp',
        message: `${event.name}: ${same.title} moved from ${oldDate} to ${newDate}. Your preparation plan has been recalculated.`,
        type: 'warning',
      });
    }
    changes++;
  }

  if (changes > 0) {
    await recalculateAndPersistPlanner(event._id.toString(), event.ownerId.toString());
  }
  return changes;
}

export async function verifyWhatsAppWebhook(req: Request, res: Response) {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  if (mode === 'subscribe' && token && env.whatsappVerifyToken && token === env.whatsappVerifyToken && challenge) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

export async function receiveWhatsAppWebhook(req: Request & { rawBody?: Buffer }, res: Response) {
  const signature = req.header('x-hub-signature-256') || '';
  if (!env.whatsappAppSecret || !signature || !req.rawBody || !signatureMatches(req.rawBody, signature, env.whatsappAppSecret)) {
    return res.sendStatus(403);
  }

  // Meta expects a quick acknowledgement. Process the event after responding.
  res.sendStatus(200);

  if (req.body?.object !== 'whatsapp_business_account') return;

  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      const phoneNumberId = String(value?.metadata?.phone_number_id || '');
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      if (!phoneNumberId || !messages.length) continue;

      const sources = await ConnectedSource.find({
        type: 'whatsapp',
        status: 'active',
        externalId: phoneNumberId,
      });
      const candidates = (await Promise.all(
        sources.map(async (source) => ({ source, event: await Event.findById(source.eventId) }))
      )).filter(({ event }) => Boolean(event)) as Array<{ source: any; event: any }>;

      for (const message of messages) {
        const text = extractMessageText(message);
        if (!text) continue;

        const ranked = candidates
          .map(({ source, event }) => ({ source, event, score: scoreEvent(text, event, source) }))
          .filter((candidate) => candidate.score > 0)
          .sort((a, b) => b.score - a.score);

        // If no event matches, or multiple events match equally, ignore the message.
        // This is the event-isolation guard that prevents cross-event deadline updates.
        if (!ranked.length || (ranked.length > 1 && ranked[0].score === ranked[1].score)) continue;

        const { event, source } = ranked[0];
        try {
          await applyWhatsAppMessage(event, source, text, String(message?.id || 'unknown'));
          source.lastMessageAt = new Date(Number(message?.timestamp) * 1000 || Date.now());
          source.lastSyncedAt = new Date();
          source.lastError = undefined;
          await source.save();
        } catch (err) {
          source.lastError = err instanceof Error ? err.message.slice(0, 500) : 'WhatsApp message processing failed';
          await source.save().catch(() => undefined);
          console.warn('[sources] WhatsApp message could not be analyzed:', err instanceof Error ? err.message : err);
        }
      }
    }
  }
}

export function getWhatsAppIntegrationStatus(_req: Request, res: Response) {
  res.json({
    success: true,
    data: {
      configured: Boolean(env.whatsappVerifyToken && env.whatsappPhoneNumberId && env.whatsappAccessToken && env.whatsappAppSecret),
      verifyTokenConfigured: Boolean(env.whatsappVerifyToken),
      phoneNumberIdConfigured: Boolean(env.whatsappPhoneNumberId),
      accessTokenConfigured: Boolean(env.whatsappAccessToken),
      appSecretConfigured: Boolean(env.whatsappAppSecret),
    },
  });
}
