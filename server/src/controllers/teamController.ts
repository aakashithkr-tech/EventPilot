import { Response } from 'express';
import { Types } from 'mongoose';
import { EventMembership, MembershipRole } from '../models/EventMembership';
import { User } from '../models/User';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent, ensureEventMember, isValidObjectId } from '../utils/eventAccess';

const MEMBERSHIP_ROLES: MembershipRole[] = [
  'owner',
  'admin',
  'lead',
  'developer',
  'researcher',
  'organizer',
  'member',
];

async function requireAdmin(eventId: Types.ObjectId, userId: string) {
  const membership = await EventMembership.findOne({ eventId, userId, status: 'active' });
  const isAdmin = membership && ['owner', 'admin', 'lead'].includes(membership.role);
  if (!isAdmin) {
    throw new AppError('You do not have permission to manage this event\'s team', 403, 'FORBIDDEN');
  }
  return membership!;
}

export const getEventTeam = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);

  const memberships = await EventMembership.find({ eventId: event._id, status: 'active' })
    .populate('userId', 'name email avatar')
    .sort({ createdAt: 1 });

  res.json({ success: true, data: { members: memberships.map((m) => m.toJSON()) } });
});

export const addTeamMember = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  await requireAdmin(event._id, req.userId as string);

  const { userId, email, role } = req.body || {};

  if (role !== undefined && !MEMBERSHIP_ROLES.includes(role)) {
    throw new AppError(`role must be one of: ${MEMBERSHIP_ROLES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  let targetUserId: string | undefined = userId;
  if (!targetUserId && email) {
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      throw new AppError('No EventPilot account exists for that email. Send an invitation instead.', 404, 'NOT_FOUND');
    }
    targetUserId = user._id.toString();
  }

  if (!targetUserId || !isValidObjectId(targetUserId)) {
    throw new AppError('A valid userId or a registered email is required', 400, 'VALIDATION_ERROR');
  }

  const user = await User.findById(targetUserId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const existing = await EventMembership.findOne({ eventId: event._id, userId: targetUserId });
  if (existing && existing.status === 'active') {
    throw new AppError('This person is already on the team', 409, 'CONFLICT');
  }

  const membership = existing
    ? await EventMembership.findOneAndUpdate(
        { _id: existing._id },
        { status: 'active', role: role || existing.role },
        { new: true }
      )
    : await EventMembership.create({
        eventId: event._id,
        userId: targetUserId,
        role: role || 'member',
        status: 'active',
      });

  await ensureEventMember(event, targetUserId);

  const populated = await membership!.populate('userId', 'name email avatar');

  res.status(201).json({ success: true, data: { member: populated.toJSON() } });
});

export const removeTeamMember = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  const { userId } = req.params;

  if (!isValidObjectId(userId)) {
    throw new AppError('Invalid user id', 400, 'VALIDATION_ERROR');
  }

  const isSelf = userId === req.userId;
  if (!isSelf) {
    await requireAdmin(event._id, req.userId as string);
  }

  if (userId === event.ownerId.toString()) {
    throw new AppError('The event owner cannot be removed from the team', 400, 'BAD_REQUEST');
  }

  const membership = await EventMembership.findOne({ eventId: event._id, userId });
  if (!membership) {
    throw new AppError('This person is not on the team', 404, 'NOT_FOUND');
  }

  await membership.deleteOne();

  event.members = event.members.filter((m) => m.toString() !== userId);
  await event.save();

  res.json({ success: true, data: null });
});
