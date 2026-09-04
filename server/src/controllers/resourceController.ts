import { Response } from 'express';
import { Resource, ResourceType } from '../models/Resource';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent, isValidObjectId } from '../utils/eventAccess';

const RESOURCE_TYPES: ResourceType[] = ['template', 'document', 'link'];

interface ResourceInput {
  name?: unknown;
  type?: unknown;
  fileType?: unknown;
  source?: unknown;
  url?: unknown;
}

/** Validates + normalizes a single resource payload. Shared by create and bulk-create. */
function normalizeCreateInput(input: ResourceInput, index?: number) {
  const label = index !== undefined ? ` (item ${index})` : '';

  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    throw new AppError(`Resource name is required${label}`, 400, 'VALIDATION_ERROR');
  }
  if (typeof input.type !== 'string' || !RESOURCE_TYPES.includes(input.type as ResourceType)) {
    throw new AppError(`type must be one of: ${RESOURCE_TYPES.join(', ')}${label}`, 400, 'VALIDATION_ERROR');
  }
  if (typeof input.fileType !== 'string' || input.fileType.trim().length === 0) {
    throw new AppError(`fileType is required${label}`, 400, 'VALIDATION_ERROR');
  }
  if (typeof input.source !== 'string' || input.source.trim().length === 0) {
    throw new AppError(`source is required${label}`, 400, 'VALIDATION_ERROR');
  }
  if (typeof input.url !== 'string' || input.url.trim().length === 0) {
    throw new AppError(`url is required${label}`, 400, 'VALIDATION_ERROR');
  }

  return {
    name: input.name.trim(),
    type: input.type as ResourceType,
    fileType: input.fileType.trim(),
    source: input.source.trim(),
    url: input.url.trim(),
  };
}

/** Loads a resource and authorizes the requester against its parent event. */
async function loadAuthorizedResource(resourceId: string, userId: string) {
  if (!isValidObjectId(resourceId)) {
    throw new AppError('Invalid resource id', 400, 'VALIDATION_ERROR');
  }
  const resource = await Resource.findById(resourceId);
  if (!resource) {
    throw new AppError('Resource not found', 404, 'NOT_FOUND');
  }
  // Throws (404) if the requester isn't the event's owner/member — same
  // isolation guarantee every event-scoped resource goes through.
  await loadAuthorizedEvent(resource.eventId.toString(), userId);
  return resource;
}

export const getEventResources = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  const resources = await Resource.find({ eventId: event._id }).sort({ createdAt: 1 });

  res.json({ success: true, data: { resources: resources.map((r) => r.toJSON()) } });
});

export const createResource = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const normalized = normalizeCreateInput(req.body || {});

  const resource = await Resource.create({
    eventId: event._id,
    createdBy: req.userId,
    ...normalized,
  });

  res.status(201).json({ success: true, data: { resource: resource.toJSON() } });
});

/**
 * Bulk-creates resources for an event in one call — mirrors
 * bulkCreateRequirements, used by event creation (the AI-analysis step
 * hands back a batch of resources alongside requirements).
 */
export const bulkCreateResources = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const { resources } = req.body || {};

  if (!Array.isArray(resources) || resources.length === 0) {
    throw new AppError('resources must be a non-empty array', 400, 'VALIDATION_ERROR');
  }
  if (resources.length > 100) {
    throw new AppError('Cannot create more than 100 resources at once', 400, 'VALIDATION_ERROR');
  }

  const normalized = resources.map((r: ResourceInput, i: number) => normalizeCreateInput(r, i));

  const docs = await Resource.insertMany(
    normalized.map((n) => ({ eventId: event._id, createdBy: req.userId, ...n }))
  );

  res.status(201).json({ success: true, data: { resources: docs.map((d) => d.toJSON()) } });
});

export const updateResource = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const resource = await loadAuthorizedResource(req.params.id, req.userId as string);
  const updates = req.body || {};

  if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length === 0)) {
    throw new AppError('name cannot be empty', 400, 'VALIDATION_ERROR');
  }
  if (updates.type !== undefined && !RESOURCE_TYPES.includes(updates.type)) {
    throw new AppError(`type must be one of: ${RESOURCE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (updates.fileType !== undefined && (typeof updates.fileType !== 'string' || updates.fileType.trim().length === 0)) {
    throw new AppError('fileType cannot be empty', 400, 'VALIDATION_ERROR');
  }
  if (updates.source !== undefined && (typeof updates.source !== 'string' || updates.source.trim().length === 0)) {
    throw new AppError('source cannot be empty', 400, 'VALIDATION_ERROR');
  }
  if (updates.url !== undefined && (typeof updates.url !== 'string' || updates.url.trim().length === 0)) {
    throw new AppError('url cannot be empty', 400, 'VALIDATION_ERROR');
  }

  if (updates.name !== undefined) resource.name = updates.name.trim();
  if (updates.type !== undefined) resource.type = updates.type;
  if (updates.fileType !== undefined) resource.fileType = updates.fileType.trim();
  if (updates.source !== undefined) resource.source = updates.source.trim();
  if (updates.url !== undefined) resource.url = updates.url.trim();

  await resource.save();

  res.json({ success: true, data: { resource: resource.toJSON() } });
});

export const deleteResource = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const resource = await loadAuthorizedResource(req.params.id, req.userId as string);
  await resource.deleteOne();
  res.json({ success: true, data: null });
});
