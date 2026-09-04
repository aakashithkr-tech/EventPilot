import { Event } from '../models/Event';
import { Deadline } from '../models/Deadline';
import { EventUpdate } from '../models/EventUpdate';
import { Notification } from '../models/Notification';
import { analyzeEventSource } from './eventAnalysisService';
import { recalculateAndPersistPlanner } from './plannerService';
import { Types } from 'mongoose';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function logicalKey(title: string): string {
  const value = normalize(title);
  if (/registration/.test(value) && /open|start|begin/.test(value)) return 'registration-open';
  if (/registration|application/.test(value) && /close|closing|deadline|last date|due/.test(value)) return 'registration-close';
  if (/submission/.test(value) && /final|close|closing|deadline|last date|due/.test(value)) return 'final-submission';
  if (/proposal/.test(value)) return 'proposal';
  if (/abstract/.test(value)) return 'abstract';
  if (/presentation/.test(value)) return 'presentation';
  if (/speaker/.test(value)) return 'speaker';
  if (/event/.test(value) && /start/.test(value)) return 'event-start';
  if (/event/.test(value) && /end/.test(value)) return 'event-end';
  return value;
}

function isFinalDeadline(title: string): boolean {
  return /final|submission|final\s+deadline|last\s+(date|day)|due/i.test(title) && !/registration/i.test(title);
}

async function notifyMembers(event: any, title: string, message: string): Promise<void> {
  const memberIds = new Set<string>([
    event.ownerId.toString(),
    ...(event.members || []).map((id: any) => id.toString()),
  ]);
  for (const userId of memberIds) {
    await Notification.create({
      userId: new Types.ObjectId(userId),
      eventId: event._id,
      title,
      message,
      type: 'warning',
    });
  }
}

export async function syncWebsiteEvent(eventId: string): Promise<{ changed: number }> {
  const event = await Event.findById(eventId);
  if (!event?.websiteUrl) return { changed: 0 };

  const result = await analyzeEventSource(event.websiteUrl);
  if (result.sourceType !== 'url' || result.deadlines.length === 0) return { changed: 0 };

  // The analyzer already returns one latest canonical value per logical
  // milestone. Load existing official deadlines once and reconcile them by the
  // same logical key so old duplicate records from earlier builds are cleaned up.
  const existing = await Deadline.find({ eventId: event._id, type: 'official' }).sort({ date: -1 });
  const byKey = new Map<string, typeof existing>();
  for (const deadline of existing) {
    const key = logicalKey(deadline.title);
    const list = byKey.get(key) || [];
    list.push(deadline);
    byKey.set(key, list);
  }

  let changed = 0;
  let plannerNeedsRecalc = false;

  for (const incoming of result.deadlines) {
    const key = logicalKey(incoming.title);
    const matches = byKey.get(key) || [];
    const canonical = matches[0];

    if (!canonical) {
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
        description: `${incoming.title} was detected from the connected event website.`,
        metadata: { newValue: incoming.date, sourceUrl: event.websiteUrl },
      });
      if (isFinalDeadline(incoming.title)) plannerNeedsRecalc = true;
      changed++;
      continue;
    }

    const oldDate = canonical.date.toISOString().slice(0, 10);
    if (oldDate !== incoming.date) {
      canonical.date = new Date(incoming.date);
      canonical.title = incoming.title;
      canonical.verified = true;
      await canonical.save();
      await EventUpdate.create({
        eventId: event._id,
        createdBy: event.ownerId,
        type: 'deadline-change',
        title: 'Deadline updated from event website',
        description: `${incoming.title} changed from ${oldDate} to ${incoming.date}. EventPilot detected the change during an automatic source check.`,
        metadata: { oldValue: oldDate, newValue: incoming.date, sourceUrl: event.websiteUrl },
      });
      await notifyMembers(
        event,
        'Deadline Updated',
        `${event.name}: ${incoming.title} moved from ${oldDate} to ${incoming.date}. Your preparation plan will be recalculated.`,
      );
      if (isFinalDeadline(incoming.title)) {
        event.finalDeadline = new Date(incoming.date);
        plannerNeedsRecalc = true;
      }
      changed++;
    }

    // Remove stale duplicates for this same logical milestone. Keep the
    // canonical record with the latest source date; never keep conflicting old
    // copies in the workspace.
    for (const duplicate of matches.slice(1)) {
      await duplicate.deleteOne();
      changed++;
    }
  }

  if (plannerNeedsRecalc) await event.save();
  if (changed > 0) {
    await recalculateAndPersistPlanner(event._id.toString(), event.ownerId.toString());
  }

  return { changed };
}

export async function syncAllWebsiteEvents(requestedUserId?: string): Promise<{ eventsChecked: number; changed: number }> {
  const filter: any = { websiteUrl: { $exists: true, $ne: '' } };
  if (requestedUserId) filter.$or = [{ ownerId: requestedUserId }, { members: requestedUserId }];
  const events = await Event.find(filter);
  let totalChanged = 0;
  for (const event of events) {
    try {
      const result = await syncWebsiteEvent(event._id.toString());
      if (result.changed > 0) {
        console.log(`[source-monitor] ${event.name}: ${result.changed} deadline record change(s)`);
        totalChanged += result.changed;
      }
    } catch (error) {
      console.warn(`[source-monitor] ${event.name} check failed:`, error instanceof Error ? error.message : error);
    }
  }
  return { eventsChecked: events.length, changed: totalChanged };
}

export function startWebsiteEventMonitoring(): void {
  // Run shortly after startup, then every 12 hours. This means the source is
  // checked twice per day while the backend is running, without depending on a
  // user's browser being open.
  setTimeout(() => { void syncAllWebsiteEvents(); }, 30_000);
  setInterval(() => { void syncAllWebsiteEvents(); }, 12 * 60 * 60 * 1000);
}
