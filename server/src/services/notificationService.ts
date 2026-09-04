import { Types } from 'mongoose';
import { Event, IEvent } from '../models/Event';
import { Requirement } from '../models/Requirement';
import { EventMembership } from '../models/EventMembership';
import { Notification, NotificationType } from '../models/Notification';

interface Threshold {
  label: string;
  days: number; // fire once daysRemaining drops to/below this value
  buildAlert: (
    event: IEvent,
    daysRemaining: number,
    incompleteCount: number
  ) => { title: string; message: string; type: NotificationType };
}

// Same staged thresholds as the original frontend-only engine
// (utils/notificationEngine.ts) — ordered farthest-out to closest so
// history reads chronologically. Ported here so generation is a real,
// idempotent backend operation instead of a client useEffect that
// re-derives from scratch every session.
const THRESHOLDS: Threshold[] = [
  {
    label: '15d',
    days: 15,
    buildAlert: (event, daysRemaining, incompleteCount) => ({
      title: 'Preparation Window Open',
      type: 'warning',
      message:
        `🟡 Your ${event.name} submission is ${Math.max(1, Math.ceil(daysRemaining))} days away. ` +
        (incompleteCount > 0
          ? `Preparation should start today — ${incompleteCount} requirement(s) haven't been touched yet.`
          : `Preparation should start today.`),
    }),
  },
  {
    label: '7d',
    days: 7,
    buildAlert: (event, daysRemaining, incompleteCount) => ({
      title: 'One Week Out',
      type: 'warning',
      message:
        `🟠 Your ${event.name} submission is in ${Math.max(1, Math.ceil(daysRemaining))} days. ` +
        (incompleteCount > 0
          ? `${incompleteCount} requirement${incompleteCount === 1 ? ' is' : 's are'} still incomplete.`
          : `All requirements are complete — great pace.`),
    }),
  },
  {
    label: '3d',
    days: 3,
    buildAlert: (event, _daysRemaining, incompleteCount) => ({
      title: 'Final Review Window',
      type: 'warning',
      message:
        `⚠️ Final review should begin for ${event.name}. ` +
        (incompleteCount > 0
          ? `${incompleteCount} requirement${incompleteCount === 1 ? '' : 's'} still incomplete.`
          : `Wrap up any remaining polish.`),
    }),
  },
  {
    label: '1d',
    days: 1,
    buildAlert: (event, _daysRemaining, incompleteCount) => ({
      title: 'Submission Due Tomorrow',
      type: 'critical',
      message:
        `🔴 Final submission for ${event.name} is tomorrow. ` +
        (incompleteCount > 0
          ? `${incompleteCount} requirement${incompleteCount === 1 ? '' : 's'} still need${
              incompleteCount === 1 ? 's' : ''
            } to be finished.`
          : `Everything looks ready — do a final pass before submitting.`),
    }),
  },
  {
    label: '3h',
    days: 0.125,
    buildAlert: (event, daysRemaining) => ({
      title: 'Final Hours',
      type: 'critical',
      message: `🚨 ${event.name} submission closes in ${Math.max(
        1,
        Math.round(daysRemaining * 24)
      )}h. Submit now if you haven't already.`,
    }),
  },
];

/**
 * Generates and persists preparation-aware smart notifications for every
 * event the given user can see, fanned out to every active team member on
 * each event (real EventMembership rows — this is what makes it
 * "team-specific", not just "the caller's own copy").
 *
 * Idempotent: the (userId, milestoneKey) unique index on Notification
 * means a duplicate-key error is expected and silently skipped whenever a
 * milestone has already been surfaced to a given user, so calling this
 * repeatedly — from any team member's session, on any schedule — never
 * spams duplicate alerts.
 *
 * Returns only the notifications newly created for `requestingUserId`,
 * since that's the only inbox the caller's own session needs to update
 * immediately; every other member's copy is already persisted and will
 * show up next time they fetch their own list.
 */
export async function generateSmartNotifications(requestingUserId: string, now: Date = new Date()) {
  const events = await Event.find({
    $or: [{ ownerId: requestingUserId }, { members: requestingUserId }],
  });

  const createdForRequester: any[] = [];

  for (const event of events) {
    const msRemaining = event.finalDeadline.getTime() - now.getTime();
    const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

    // Deadline already passed, or so far out no reminder is due — skip.
    if (daysRemaining < -0.5) continue;

    const incompleteCount = await Requirement.countDocuments({ eventId: event._id, completed: false });

    // Don't nag an event that's already fully wrapped up.
    if (incompleteCount === 0 && event.progress >= 95 && daysRemaining > 1) continue;

    const dueThresholds = THRESHOLDS.filter((t) => daysRemaining <= t.days);
    if (dueThresholds.length === 0) continue;

    const memberships = await EventMembership.find({ eventId: event._id, status: 'active' });
    const memberIds = new Set<string>(memberships.map((m) => m.userId.toString()));
    memberIds.add(event.ownerId.toString());

    for (const threshold of dueThresholds) {
      const milestoneKey = `${event._id.toString()}-smart-${threshold.label}`;
      const alert = threshold.buildAlert(event, daysRemaining, incompleteCount);

      for (const memberId of memberIds) {
        try {
          const doc = await Notification.create({
            userId: new Types.ObjectId(memberId),
            eventId: event._id,
            title: alert.title,
            message: alert.message,
            type: alert.type,
            milestoneKey,
          });
          if (memberId === requestingUserId) {
            createdForRequester.push(doc.toJSON());
          }
        } catch (err: any) {
          // Duplicate (userId, milestoneKey) — already surfaced to this
          // user, this is the expected/normal dedup path, not an error.
          if (err?.code !== 11000) throw err;
        }
      }
    }
  }

  return createdForRequester;
}
