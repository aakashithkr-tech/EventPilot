import { Types } from 'mongoose';
import { Event, IEvent } from '../models/Event';
import { AppError } from '../middleware/errorMiddleware';

export function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

/**
 * Loads an event by id and throws if it doesn't exist or the requesting
 * user is neither the owner nor a member. Every event-scoped route (events,
 * team, invitations, and future tasks/requirements/resources) must go
 * through this so isolation is enforced identically everywhere.
 */
export async function loadAuthorizedEvent(eventId: string, userId: string): Promise<IEvent> {
  if (!isValidObjectId(eventId)) {
    throw new AppError('Invalid event id', 400, 'VALIDATION_ERROR');
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new AppError('Event not found', 404, 'NOT_FOUND');
  }

  const isOwner = event.ownerId.toString() === userId;
  const isMember = event.members.some((m) => m.toString() === userId);

  if (!isOwner && !isMember) {
    // Same 404 a nonexistent event would return, so unauthorized users
    // can't distinguish "not yours" from "doesn't exist".
    throw new AppError('Event not found', 404, 'NOT_FOUND');
  }

  return event;
}

/** Adds a user to an event's `members` array if not already present. */
export async function ensureEventMember(event: IEvent, userId: Types.ObjectId | string): Promise<void> {
  const idStr = userId.toString();
  const alreadyMember = event.members.some((m) => m.toString() === idStr);
  if (!alreadyMember) {
    event.members.push(new Types.ObjectId(idStr));
    await event.save();
  }
}
