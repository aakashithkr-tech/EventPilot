import { Response } from 'express';
import { Event, EventStatus, EventTypeEnum } from '../models/Event';
import { EventMembership } from '../models/EventMembership';
import { EventInvitation } from '../models/EventInvitation';
import { Task } from '../models/Task';
import { Requirement } from '../models/Requirement';
import { Resource } from '../models/Resource';
import { Deadline } from '../models/Deadline';
import { EventUpdate } from '../models/EventUpdate';
import { ConnectedSource } from '../models/ConnectedSource';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent } from '../utils/eventAccess';
import { recalculateAndPersistPlanner } from '../services/plannerService';

const EVENT_TYPES: EventTypeEnum[] = ['hackathon', 'competition', 'conference', 'workshop'];
const EVENT_STATUSES: EventStatus[] = ['on-track', 'needs-attention', 'at-risk'];

function validateCreatePayload(body: any) {
  const { name, type, finalDeadline } = body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new AppError('Event name is required', 400, 'VALIDATION_ERROR');
  }
  if (!type || !EVENT_TYPES.includes(type)) {
    throw new AppError(`Event type must be one of: ${EVENT_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (!finalDeadline || Number.isNaN(new Date(finalDeadline).getTime())) {
    throw new AppError('A valid finalDeadline date is required', 400, 'VALIDATION_ERROR');
  }
}

export const createEvent = asyncHandler(async (req: AuthedRequest, res: Response) => {
  validateCreatePayload(req.body);

  const {
    name,
    type,
    description,
    websiteUrl,
    finalDeadline,
    teamSize,
    nextAction,
    status,
  } = req.body;

  const event = await Event.create({
    name: name.trim(),
    type,
    description: typeof description === 'string' ? description.trim() : '',
    websiteUrl: typeof websiteUrl === 'string' ? websiteUrl.trim() : undefined,
    status: status && EVENT_STATUSES.includes(status) ? status : 'on-track',
    finalDeadline: new Date(finalDeadline),
    progress: 0,
    healthScore: 100,
    teamSize: Number.isFinite(Number(teamSize)) && Number(teamSize) > 0 ? Number(teamSize) : 1,
    nextAction: typeof nextAction === 'string' ? nextAction : '',
    ownerId: req.userId,
    members: [req.userId],
  });

  // Every event has a corresponding EventMembership for its owner, so
  // "who's on this event" always has one source of truth (EventMembership),
  // and the switcher / team roster don't need special-casing for owners.
  await EventMembership.create({
    eventId: event._id,
    userId: req.userId,
    role: 'owner',
    status: 'active',
  });

  res.status(201).json({ success: true, data: { event: event.toJSON() } });
});

export const getEvents = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const events = await Event.find({
    $or: [{ ownerId: req.userId }, { members: req.userId }],
  }).sort({ createdAt: -1 });

  res.json({ success: true, data: { events: events.map((e) => e.toJSON()) } });
});

export const getEvent = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  res.json({ success: true, data: { event: event.toJSON() } });
});

export const updateEvent = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  const allowedFields = [
    'name',
    'type',
    'description',
    'websiteUrl',
    'status',
    'finalDeadline',
    'progress',
    'healthScore',
    'teamSize',
    'nextAction',
  ] as const;

  const updates = req.body || {};

  if (updates.type !== undefined && !EVENT_TYPES.includes(updates.type)) {
    throw new AppError(`Event type must be one of: ${EVENT_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (updates.status !== undefined && !EVENT_STATUSES.includes(updates.status)) {
    throw new AppError(`Event status must be one of: ${EVENT_STATUSES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (updates.finalDeadline !== undefined && Number.isNaN(new Date(updates.finalDeadline).getTime())) {
    throw new AppError('finalDeadline must be a valid date', 400, 'VALIDATION_ERROR');
  }
  if (updates.progress !== undefined) {
    const p = Number(updates.progress);
    if (Number.isNaN(p) || p < 0 || p > 100) {
      throw new AppError('progress must be a number between 0 and 100', 400, 'VALIDATION_ERROR');
    }
  }
  if (updates.healthScore !== undefined) {
    const h = Number(updates.healthScore);
    if (Number.isNaN(h) || h < 0 || h > 100) {
      throw new AppError('healthScore must be a number between 0 and 100', 400, 'VALIDATION_ERROR');
    }
  }

  const oldFinalDeadline = event.finalDeadline.toISOString();
  const changedFields: string[] = [];

  for (const field of allowedFields) {
    if (updates[field] === undefined) continue;
    changedFields.push(field);
    if (field === 'finalDeadline') {
      (event as any).finalDeadline = new Date(updates.finalDeadline);
    } else if (field === 'name' || field === 'description' || field === 'websiteUrl') {
      (event as any)[field] = typeof updates[field] === 'string' ? updates[field].trim() : updates[field];
    } else {
      (event as any)[field] = updates[field];
    }
  }

  await event.save();

  if (changedFields.length > 0) {
    await EventUpdate.create({
      eventId: event._id,
      createdBy: req.userId,
      type: 'announcement',
      title: 'Event details updated',
      description: `Event details changed: ${changedFields.join(', ')}.`,
      metadata: updates.finalDeadline !== undefined
        ? { oldValue: oldFinalDeadline.slice(0, 10), newValue: event.finalDeadline.toISOString().slice(0, 10) }
        : undefined,
    });
  }

  if (changedFields.includes('finalDeadline') || changedFields.includes('teamSize')) {
    await recalculateAndPersistPlanner(event._id.toString(), req.userId as string);
  }

  res.json({ success: true, data: { event: event.toJSON() } });
});

export const deleteEvent = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  if (event.ownerId.toString() !== req.userId) {
    throw new AppError('Only the event owner can delete this event', 403, 'FORBIDDEN');
  }

  await EventMembership.deleteMany({ eventId: event._id });
  await EventInvitation.deleteMany({ eventId: event._id });
  // Also clean up every other event-scoped collection so deleting an event
  // doesn't leave orphaned tasks/requirements/resources/deadlines/updates
  // behind — a pre-existing gap from when those features were each added
  // (their controllers never touched deleteEvent), fixed alongside Event
  // Updates since this is the natural place to close it.
  await Task.deleteMany({ eventId: event._id });
  await Requirement.deleteMany({ eventId: event._id });
  await Resource.deleteMany({ eventId: event._id });
  await Deadline.deleteMany({ eventId: event._id });
  await EventUpdate.deleteMany({ eventId: event._id });
  await ConnectedSource.deleteMany({ eventId: event._id });
  await event.deleteOne();

  res.json({ success: true, data: null });
});
