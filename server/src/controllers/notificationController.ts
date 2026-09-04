import { Response } from 'express';
import { Types } from 'mongoose';
import { Notification, NotificationType } from '../models/Notification';
import { EventMembership } from '../models/EventMembership';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent } from '../utils/eventAccess';
import { generateSmartNotifications } from '../services/notificationService';

const NOTIFICATION_TYPES: NotificationType[] = ['critical', 'warning', 'info', 'success'];

/** Every notification a user sees is their own row — real, per-user data, not a shared/local array. */
export const getNotifications = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const notifications = await Notification.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .limit(200);

  res.json({ success: true, data: { notifications: notifications.map((n) => n.toJSON()) } });
});

/**
 * Creates a notification. Two modes:
 *  - Default: a single notification for the requesting user (manual/
 *    one-off alerts like "your update failed to save").
 *  - `targetTeam: true` + `eventId`: fans out the same notification to
 *    every active member of that event (real EventMembership rows) — this
 *    is what makes things like "deadline updated" actually reach the
 *    whole team instead of just the person who triggered it.
 */
export const createNotification = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { eventId, title, message, type, targetTeam } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new AppError('title is required', 400, 'VALIDATION_ERROR');
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new AppError('message is required', 400, 'VALIDATION_ERROR');
  }
  if (!type || !NOTIFICATION_TYPES.includes(type)) {
    throw new AppError(`type must be one of: ${NOTIFICATION_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  let event = null;
  if (eventId) {
    event = await loadAuthorizedEvent(eventId, req.userId as string);
  }

  if (targetTeam) {
    if (!event) {
      throw new AppError('eventId is required when targetTeam is true', 400, 'VALIDATION_ERROR');
    }
    const memberships = await EventMembership.find({ eventId: event._id, status: 'active' });
    const memberIds = new Set<string>(memberships.map((m) => m.userId.toString()));
    memberIds.add(event.ownerId.toString());

    let ownNotification = null;
    for (const memberId of memberIds) {
      const doc = await Notification.create({
        userId: new Types.ObjectId(memberId),
        eventId: event._id,
        title: title.trim(),
        message: message.trim(),
        type,
        createdBy: req.userId,
      });
      if (memberId === req.userId) ownNotification = doc;
    }

    res.status(201).json({
      success: true,
      data: { notification: (ownNotification ?? (await Notification.findOne({ userId: req.userId, eventId: event._id, title: title.trim() }).sort({ createdAt: -1 })))?.toJSON() },
    });
    return;
  }

  const notification = await Notification.create({
    userId: req.userId,
    eventId: event?._id,
    title: title.trim(),
    message: message.trim(),
    type,
    createdBy: req.userId,
  });

  res.status(201).json({ success: true, data: { notification: notification.toJSON() } });
});

export const markNotificationRead = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid notification id', 400, 'VALIDATION_ERROR');
  }

  // Scoped to userId so one user can never mark (or even discover) another
  // user's notification as read — same 404-for-not-yours pattern used
  // throughout the app (loadAuthorizedEvent).
  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId: req.userId },
    { read: true },
    { new: true }
  );

  if (!notification) {
    throw new AppError('Notification not found', 404, 'NOT_FOUND');
  }

  res.json({ success: true, data: { notification: notification.toJSON() } });
});

export const markAllNotificationsRead = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await Notification.updateMany({ userId: req.userId, read: false }, { read: true });
  res.json({ success: true, data: { success: true } });
});

/**
 * Runs the backend smart-notification engine (§19) for the requesting
 * user's events and fans results out to every real active team member
 * (§20). Safe to call as often as the frontend likes — dedup happens at
 * the database level via Notification's (userId, milestoneKey) unique
 * index, not in this handler.
 */
export const generateNotifications = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const created = await generateSmartNotifications(req.userId as string);
  res.json({ success: true, data: { notifications: created } });
});
