import { Response } from 'express';
import { Requirement } from '../models/Requirement';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent, isValidObjectId } from '../utils/eventAccess';

interface RequirementInput {
  title?: unknown;
  description?: unknown;
  requiredBy?: unknown;
  sourceLink?: unknown;
  completed?: unknown;
  verified?: unknown;
}

/** Validates + normalizes a single requirement payload. Shared by create and bulk-create. */
function normalizeCreateInput(input: RequirementInput, index?: number) {
  const label = index !== undefined ? ` (item ${index})` : '';

  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    throw new AppError(`Requirement title is required${label}`, 400, 'VALIDATION_ERROR');
  }
  if (typeof input.requiredBy !== 'string' || input.requiredBy.trim().length === 0) {
    throw new AppError(`requiredBy is required${label}`, 400, 'VALIDATION_ERROR');
  }
  if (input.description !== undefined && typeof input.description !== 'string') {
    throw new AppError(`description must be a string${label}`, 400, 'VALIDATION_ERROR');
  }
  if (input.sourceLink !== undefined && typeof input.sourceLink !== 'string') {
    throw new AppError(`sourceLink must be a string${label}`, 400, 'VALIDATION_ERROR');
  }

  return {
    title: input.title.trim(),
    requiredBy: input.requiredBy.trim(),
    description: typeof input.description === 'string' ? input.description.trim() : undefined,
    sourceLink: typeof input.sourceLink === 'string' ? input.sourceLink.trim() : undefined,
    completed: typeof input.completed === 'boolean' ? input.completed : false,
    verified: typeof input.verified === 'boolean' ? input.verified : false,
  };
}

/** Loads a requirement and authorizes the requester against its parent event. */
async function loadAuthorizedRequirement(requirementId: string, userId: string) {
  if (!isValidObjectId(requirementId)) {
    throw new AppError('Invalid requirement id', 400, 'VALIDATION_ERROR');
  }
  const requirement = await Requirement.findById(requirementId);
  if (!requirement) {
    throw new AppError('Requirement not found', 404, 'NOT_FOUND');
  }
  // Throws (404) if the requester isn't the event's owner/member — same
  // isolation guarantee every event-scoped resource goes through.
  await loadAuthorizedEvent(requirement.eventId.toString(), userId);
  return requirement;
}

export const getEventRequirements = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  const requirements = await Requirement.find({ eventId: event._id }).sort({ createdAt: 1 });

  res.json({ success: true, data: { requirements: requirements.map((r) => r.toJSON()) } });
});

export const createRequirement = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const normalized = normalizeCreateInput(req.body || {});

  const requirement = await Requirement.create({
    eventId: event._id,
    createdBy: req.userId,
    ...normalized,
  });

  res.status(201).json({ success: true, data: { requirement: requirement.toJSON() } });
});

/**
 * Bulk-creates requirements for an event in one call — used by event
 * creation (Onboarding's AI-analysis step hands back a batch of proposed
 * requirements up front, same moment the event itself is created).
 */
export const bulkCreateRequirements = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const { requirements } = req.body || {};

  if (!Array.isArray(requirements) || requirements.length === 0) {
    throw new AppError('requirements must be a non-empty array', 400, 'VALIDATION_ERROR');
  }
  if (requirements.length > 100) {
    throw new AppError('Cannot create more than 100 requirements at once', 400, 'VALIDATION_ERROR');
  }

  const normalized = requirements.map((r: RequirementInput, i: number) => normalizeCreateInput(r, i));

  const docs = await Requirement.insertMany(
    normalized.map((n) => ({ eventId: event._id, createdBy: req.userId, ...n }))
  );

  res.status(201).json({ success: true, data: { requirements: docs.map((d) => d.toJSON()) } });
});

export const updateRequirement = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const requirement = await loadAuthorizedRequirement(req.params.id, req.userId as string);
  const updates = req.body || {};

  if (updates.title !== undefined && (typeof updates.title !== 'string' || updates.title.trim().length === 0)) {
    throw new AppError('title cannot be empty', 400, 'VALIDATION_ERROR');
  }
  if (updates.requiredBy !== undefined && (typeof updates.requiredBy !== 'string' || updates.requiredBy.trim().length === 0)) {
    throw new AppError('requiredBy cannot be empty', 400, 'VALIDATION_ERROR');
  }
  if (updates.completed !== undefined && typeof updates.completed !== 'boolean') {
    throw new AppError('completed must be a boolean', 400, 'VALIDATION_ERROR');
  }
  if (updates.verified !== undefined && typeof updates.verified !== 'boolean') {
    throw new AppError('verified must be a boolean', 400, 'VALIDATION_ERROR');
  }

  if (updates.title !== undefined) requirement.title = updates.title.trim();
  if (updates.requiredBy !== undefined) requirement.requiredBy = updates.requiredBy.trim();
  if (updates.description !== undefined) requirement.description = String(updates.description).trim();
  if (updates.sourceLink !== undefined) requirement.sourceLink = String(updates.sourceLink).trim();
  if (updates.completed !== undefined) requirement.completed = updates.completed;
  if (updates.verified !== undefined) requirement.verified = updates.verified;

  await requirement.save();

  res.json({ success: true, data: { requirement: requirement.toJSON() } });
});

export const deleteRequirement = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const requirement = await loadAuthorizedRequirement(req.params.id, req.userId as string);
  await requirement.deleteOne();
  res.json({ success: true, data: null });
});
