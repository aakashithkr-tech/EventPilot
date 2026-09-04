import { Response } from 'express';
import { Task, TaskPriority, TaskStatus } from '../models/Task';
import { EventMembership } from '../models/EventMembership';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent, isValidObjectId } from '../utils/eventAccess';

const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
const TASK_STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];

const ASSIGNEE_POPULATE = { path: 'assigneeId', select: 'name email avatar' };

/**
 * A task can only be assigned to someone who is actually on the event's
 * team — this is the "task assignments must reference actual users [who
 * belong to this event]" guarantee, enforced structurally rather than
 * trusted from the client.
 */
async function assertAssignable(eventId: string, assigneeId: string) {
  if (!isValidObjectId(assigneeId)) {
    throw new AppError('Invalid assignee id', 400, 'VALIDATION_ERROR');
  }
  const membership = await EventMembership.findOne({ eventId, userId: assigneeId, status: 'active' });
  if (!membership) {
    throw new AppError('Assignee must be an active member of this event', 400, 'VALIDATION_ERROR');
  }
}

/** Loads a task and authorizes the requester against its parent event. */
async function loadAuthorizedTask(taskId: string, userId: string) {
  if (!isValidObjectId(taskId)) {
    throw new AppError('Invalid task id', 400, 'VALIDATION_ERROR');
  }
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', 404, 'NOT_FOUND');
  }
  // Throws (404) if the requester isn't the event's owner/member.
  await loadAuthorizedEvent(task.eventId.toString(), userId);
  return task;
}

export const getEventTasks = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  const tasks = await Task.find({ eventId: event._id })
    .populate(ASSIGNEE_POPULATE)
    .sort({ createdAt: -1 });

  res.json({ success: true, data: { tasks: tasks.map((t) => t.toJSON()) } });
});

export const createTask = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  const { title, description, assigneeId, dueDate, priority, status, requirementId } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new AppError('Task title is required', 400, 'VALIDATION_ERROR');
  }
  if (priority !== undefined && !TASK_PRIORITIES.includes(priority)) {
    throw new AppError(`priority must be one of: ${TASK_PRIORITIES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (status !== undefined && !TASK_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${TASK_STATUSES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (dueDate !== undefined && dueDate !== null && dueDate !== '' && Number.isNaN(new Date(dueDate).getTime())) {
    throw new AppError('dueDate must be a valid date', 400, 'VALIDATION_ERROR');
  }
  if (assigneeId) {
    await assertAssignable(event._id.toString(), assigneeId);
  }

  const task = await Task.create({
    eventId: event._id,
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    assigneeId: assigneeId || undefined,
    createdBy: req.userId,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    priority: priority || 'medium',
    status: status || 'todo',
    requirementId: typeof requirementId === 'string' ? requirementId : undefined,
  });

  const populated = await task.populate(ASSIGNEE_POPULATE);

  res.status(201).json({ success: true, data: { task: populated.toJSON() } });
});

export const updateTask = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const task = await loadAuthorizedTask(req.params.id, req.userId as string);
  const updates = req.body || {};

  if (updates.priority !== undefined && !TASK_PRIORITIES.includes(updates.priority)) {
    throw new AppError(`priority must be one of: ${TASK_PRIORITIES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (updates.status !== undefined && !TASK_STATUSES.includes(updates.status)) {
    throw new AppError(`status must be one of: ${TASK_STATUSES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }
  if (updates.dueDate !== undefined && updates.dueDate !== null && updates.dueDate !== '' && Number.isNaN(new Date(updates.dueDate).getTime())) {
    throw new AppError('dueDate must be a valid date', 400, 'VALIDATION_ERROR');
  }
  if (updates.title !== undefined && (typeof updates.title !== 'string' || updates.title.trim().length === 0)) {
    throw new AppError('title cannot be empty', 400, 'VALIDATION_ERROR');
  }
  if (updates.assigneeId !== undefined && updates.assigneeId !== null && updates.assigneeId !== '') {
    await assertAssignable(task.eventId.toString(), updates.assigneeId);
  }

  if (updates.title !== undefined) task.title = updates.title.trim();
  if (updates.description !== undefined) task.description = String(updates.description).trim();
  if (updates.priority !== undefined) task.priority = updates.priority;
  if (updates.status !== undefined) task.status = updates.status;
  if (updates.requirementId !== undefined) task.requirementId = updates.requirementId || undefined;
  if (updates.dueDate !== undefined) {
    (task as any).dueDate = updates.dueDate ? new Date(updates.dueDate) : undefined;
  }
  if (updates.assigneeId !== undefined) {
    (task as any).assigneeId = updates.assigneeId || undefined;
  }

  await task.save();
  const populated = await task.populate(ASSIGNEE_POPULATE);

  res.json({ success: true, data: { task: populated.toJSON() } });
});

export const deleteTask = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const task = await loadAuthorizedTask(req.params.id, req.userId as string);
  await task.deleteOne();
  res.json({ success: true, data: null });
});
