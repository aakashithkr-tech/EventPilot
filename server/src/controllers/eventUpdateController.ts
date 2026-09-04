import { Response } from 'express';
import { EventUpdate, EventUpdateType } from '../models/EventUpdate';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent } from '../utils/eventAccess';

const UPDATE_TYPES: EventUpdateType[] = ['deadline-change', 'requirement-added', 'announcement'];

export const getEventUpdates = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  const updates = await EventUpdate.find({ eventId: event._id }).sort({ createdAt: -1 });

  res.json({ success: true, data: { updates: updates.map((u) => u.toJSON()) } });
});

/**
 * Event Updates are an append-only audit log — created by other
 * operations as they happen (e.g. a deadline-change simulation logs a
 * real entry here) rather than through their own dedicated UI, so there's
 * no update/delete endpoint, only list + create.
 */
export const createEventUpdate = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const { type, title, description, metadata } = req.body || {};

  if (!type || !UPDATE_TYPES.includes(type)) {
    throw new AppError(`type must be one of: ${UPDATE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new AppError('title is required', 400, 'VALIDATION_ERROR');
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    throw new AppError('description is required', 400, 'VALIDATION_ERROR');
  }
  if (metadata !== undefined) {
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new AppError('metadata must be an object', 400, 'VALIDATION_ERROR');
    }
    if (metadata.oldValue !== undefined && typeof metadata.oldValue !== 'string') {
      throw new AppError('metadata.oldValue must be a string', 400, 'VALIDATION_ERROR');
    }
    if (metadata.newValue !== undefined && typeof metadata.newValue !== 'string') {
      throw new AppError('metadata.newValue must be a string', 400, 'VALIDATION_ERROR');
    }
  }

  const update = await EventUpdate.create({
    eventId: event._id,
    createdBy: req.userId,
    type,
    title: title.trim(),
    description: description.trim(),
    metadata: metadata
      ? { oldValue: metadata.oldValue, newValue: metadata.newValue }
      : undefined,
  });

  res.status(201).json({ success: true, data: { update: update.toJSON() } });
});
