import { Response } from 'express';
import { Deadline, DeadlineType } from '../models/Deadline';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent, isValidObjectId } from '../utils/eventAccess';
import { EventUpdate } from '../models/EventUpdate';
import { recalculateAndPersistPlanner } from '../services/plannerService';

const DEADLINE_TYPES: DeadlineType[] = ['official', 'ai-recommended', 'personal', 'team'];

interface DeadlineInput {
  title?: unknown;
  date?: unknown;
  type?: unknown;
  verified?: unknown;
}

/** Validates + normalizes a single deadline payload. Shared by create and bulk-create. */
function normalizeCreateInput(input: DeadlineInput, index?: number) {
  const label = index !== undefined ? ` (item ${index})` : '';

  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    throw new AppError(`Deadline title is required${label}`, 400, 'VALIDATION_ERROR');
  }
  if (typeof input.date !== 'string' || Number.isNaN(new Date(input.date).getTime())) {
    throw new AppError(`date must be a valid date${label}`, 400, 'VALIDATION_ERROR');
  }
  if (input.type !== undefined && !DEADLINE_TYPES.includes(input.type as DeadlineType)) {
    throw new AppError(`type must be one of: ${DEADLINE_TYPES.join(', ')}${label}`, 400, 'VALIDATION_ERROR');
  }

  return {
    title: input.title.trim(),
    date: new Date(input.date),
    type: (input.type as DeadlineType) || 'official',
    verified: typeof input.verified === 'boolean' ? input.verified : false,
  };
}

/** Loads a deadline and authorizes the requester against its parent event. */
async function loadAuthorizedDeadline(deadlineId: string, userId: string) {
  if (!isValidObjectId(deadlineId)) {
    throw new AppError('Invalid deadline id', 400, 'VALIDATION_ERROR');
  }
  const deadline = await Deadline.findById(deadlineId);
  if (!deadline) {
    throw new AppError('Deadline not found', 404, 'NOT_FOUND');
  }
  // Throws (404) if the requester isn't the event's owner/member — same
  // isolation guarantee every event-scoped resource goes through.
  await loadAuthorizedEvent(deadline.eventId.toString(), userId);
  return deadline;
}

export const getEventDeadlines = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  const deadlines = await Deadline.find({ eventId: event._id }).sort({ date: 1 });

  res.json({ success: true, data: { deadlines: deadlines.map((d) => d.toJSON()) } });
});

export const createDeadline = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const normalized = normalizeCreateInput(req.body || {});

  const deadline = await Deadline.create({
    eventId: event._id,
    createdBy: req.userId,
    ...normalized,
  });

  if (normalized.type === 'official' && /final|submission|deadline|closing|last/i.test(normalized.title)) {
    event.finalDeadline = normalized.date;
    await event.save();
    await recalculateAndPersistPlanner(event._id.toString(), req.userId as string);
  }

  res.status(201).json({ success: true, data: { deadline: deadline.toJSON() } });
});

/**
 * Bulk-creates deadlines for an event in one call — used by event creation
 * (the manual/AI-analysis official deadlines *and* the planner's generated
 * AI-milestone deadlines both land in one batch the moment the event and
 * its requirements are created).
 */
export const bulkCreateDeadlines = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const { deadlines } = req.body || {};

  if (!Array.isArray(deadlines) || deadlines.length === 0) {
    throw new AppError('deadlines must be a non-empty array', 400, 'VALIDATION_ERROR');
  }
  if (deadlines.length > 100) {
    throw new AppError('Cannot create more than 100 deadlines at once', 400, 'VALIDATION_ERROR');
  }

  const normalized = deadlines.map((d: DeadlineInput, i: number) => normalizeCreateInput(d, i));

  const docs = await Deadline.insertMany(
    normalized.map((n) => ({ eventId: event._id, createdBy: req.userId, ...n }))
  );

  res.status(201).json({ success: true, data: { deadlines: docs.map((d) => d.toJSON()) } });
});

export const updateDeadline = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const deadline = await loadAuthorizedDeadline(req.params.id, req.userId as string);
  const updates = req.body || {};
  const oldDate = deadline.date.toISOString().slice(0, 10);
  const oldTitle = deadline.title;

  if (updates.title !== undefined && (typeof updates.title !== 'string' || updates.title.trim().length === 0)) {
    throw new AppError('title cannot be empty', 400, 'VALIDATION_ERROR');
  }
  if (updates.date !== undefined && Number.isNaN(new Date(updates.date).getTime())) {
    throw new AppError('date must be a valid date', 400, 'VALIDATION_ERROR');
  }
  if (updates.type !== undefined && !DEADLINE_TYPES.includes(updates.type)) {
    throw new AppError(`type must be one of: ${DEADLINE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (updates.verified !== undefined && typeof updates.verified !== 'boolean') {
    throw new AppError('verified must be a boolean', 400, 'VALIDATION_ERROR');
  }

  if (updates.title !== undefined) deadline.title = updates.title.trim();
  if (updates.date !== undefined) deadline.date = new Date(updates.date);
  if (updates.type !== undefined) deadline.type = updates.type;
  if (updates.verified !== undefined) deadline.verified = updates.verified;

  await deadline.save();

  const isFinalLike = deadline.type === 'official' && /final|submission|deadline|closing|last/i.test(deadline.title);
  if (isFinalLike) {
    const event = await loadAuthorizedEvent(deadline.eventId.toString(), req.userId as string);
    event.finalDeadline = deadline.date;
    await event.save();
    await recalculateAndPersistPlanner(event._id.toString(), req.userId as string);
  } else if (oldDate !== deadline.date.toISOString().slice(0, 10) || oldTitle !== deadline.title) {
    await recalculateAndPersistPlanner(deadline.eventId.toString(), req.userId as string);
  }

  if (oldDate !== deadline.date.toISOString().slice(0, 10) || oldTitle !== deadline.title) {
    await EventUpdate.create({
      eventId: deadline.eventId,
      createdBy: req.userId,
      type: 'deadline-change',
      title: 'Deadline updated manually',
      description: `${oldTitle} changed from ${oldDate} to ${deadline.date.toISOString().slice(0, 10)}.`,
      metadata: { oldValue: oldDate, newValue: deadline.date.toISOString().slice(0, 10) },
    });
  }

  res.json({ success: true, data: { deadline: deadline.toJSON() } });
});

export const deleteDeadline = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const deadline = await loadAuthorizedDeadline(req.params.id, req.userId as string);
  await deadline.deleteOne();
  res.json({ success: true, data: null });
});

/**
 * Deletes every ai-recommended deadline for an event in one call — used
 * when the preparation plan is recalculated (deadline change) so stale
 * milestones don't linger alongside the freshly-generated ones.
 */
export const deleteAiRecommendedDeadlines = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  await Deadline.deleteMany({ eventId: event._id, type: 'ai-recommended' });
  res.json({ success: true, data: null });
});
