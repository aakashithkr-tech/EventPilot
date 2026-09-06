import { Response } from 'express';
import { EventInvitation, INVITABLE_ROLES } from '../models/EventInvitation';
import { EventMembership } from '../models/EventMembership';
import { Event } from '../models/Event';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';
import { loadAuthorizedEvent, ensureEventMember, isValidObjectId } from '../utils/eventAccess';
import { sendTeamInvitationEmail, isEmailConfigured } from '../services/emailService';
import { env } from '../config/env';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin(eventId: any, userId: string) {
  const membership = await EventMembership.findOne({ eventId, userId, status: 'active' });
  const isAdmin = membership && ['owner', 'admin', 'lead'].includes(membership.role);
  if (!isAdmin) {
    throw new AppError('You do not have permission to invite people to this event', 403, 'FORBIDDEN');
  }
}

export const createInvitation = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  await requireAdmin(event._id, req.userId as string);

  const { email, role } = req.body || {};

  if (!email || !EMAIL_REGEX.test(email)) {
    throw new AppError('A valid email is required', 400, 'VALIDATION_ERROR');
  }
  if (role !== undefined && !INVITABLE_ROLES.includes(role)) {
    throw new AppError(`role must be one of: ${INVITABLE_ROLES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  // Already on the team? Don't send a redundant invite.
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const existingMembership = await EventMembership.findOne({
      eventId: event._id,
      userId: existingUser._id,
      status: 'active',
    });
    if (existingMembership) {
      throw new AppError('This person is already on the team', 409, 'CONFLICT');
    }
  }

  const existingInvite = await EventInvitation.findOne({
    eventId: event._id,
    email: normalizedEmail,
    status: 'pending',
  });
  if (existingInvite) {
    throw new AppError('An invitation is already pending for this email', 409, 'CONFLICT');
  }

  const invitation = await EventInvitation.create({
    eventId: event._id,
    email: normalizedEmail,
    invitedByUserId: req.userId,
    role: role || 'member',
  });

  const inviter = await User.findById(req.userId).select('name');
  let emailSent = false;
  try {
    emailSent = await sendTeamInvitationEmail({
      to: normalizedEmail,
      eventName: event.name,
      inviterName: inviter?.name || 'A teammate',
      role: role || 'member',
      appUrl: env.clientUrl,
    });
  } catch (error) {
    console.warn('[email] Team invitation email failed:', error instanceof Error ? error.message : error);
  }
  if (!isEmailConfigured()) {
    // Not an error — just tells whoever is reading the server logs why no
    // invite email went out, instead of it silently looking like nothing happened.
    console.warn('[email] SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD). Invitation emails will not be delivered until it is set.');
  }

  // The invited person previously had NO way to find out about the invite unless
  // the invitation email actually arrived (and it silently never did whenever SMTP
  // wasn't configured, or landed in spam). If they already have an EventPilot
  // account, also drop a real in-app notification into their account so they see
  // it in the Notifications tab the next time they log in, regardless of email delivery.
  if (existingUser) {
    try {
      await Notification.create({
        userId: existingUser._id,
        eventId: event._id,
        title: 'New team invitation',
        message: `${inviter?.name || 'A teammate'} invited you to join ${event.name} as ${role || 'member'}. Open your invitations to accept or decline.`,
        type: 'info',
        createdBy: req.userId,
      });
    } catch (error) {
      console.warn('[notification] Failed to create in-app invitation notification:', error instanceof Error ? error.message : error);
    }
  }

  res.status(201).json({
    success: true,
    data: {
      invitation: invitation.toJSON(),
      emailSent,
      emailConfigured: isEmailConfigured(),
    },
  });
});

export const listEventInvitations = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const event = await loadAuthorizedEvent(req.params.id, req.userId as string);
  await requireAdmin(event._id, req.userId as string);

  const invitations = await EventInvitation.find({ eventId: event._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: { invitations: invitations.map((i) => i.toJSON()) } });
});

export const listMyInvitations = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const invitations = await EventInvitation.find({
    email: user.email,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
    .populate('eventId', 'name type')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: { invitations: invitations.map((i) => i.toJSON()) } });
});

export const acceptInvitation = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    throw new AppError('Invalid invitation id', 400, 'VALIDATION_ERROR');
  }

  const invitation = await EventInvitation.findById(id);
  if (!invitation) {
    throw new AppError('Invitation not found', 404, 'NOT_FOUND');
  }

  const user = await User.findById(req.userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // Only the invited email can accept — logged-in identity, not the URL, decides.
  if (invitation.email !== user.email) {
    throw new AppError('This invitation was not sent to your account', 403, 'FORBIDDEN');
  }
  if (invitation.status !== 'pending') {
    throw new AppError('This invitation is no longer valid', 409, 'CONFLICT');
  }
  if (invitation.expiresAt < new Date()) {
    throw new AppError('This invitation has expired', 409, 'CONFLICT');
  }

  // The invitee isn't a member yet — that's exactly what accepting fixes —
  // so this loads the event directly rather than through the authorized
  // (owner-or-member) helper used everywhere else.
  const event = await Event.findById(invitation.eventId);
  if (!event) {
    throw new AppError('Event no longer exists', 404, 'NOT_FOUND');
  }

  const existingMembership = await EventMembership.findOne({ eventId: event._id, userId: req.userId });
  const membership = existingMembership
    ? await EventMembership.findOneAndUpdate(
        { _id: existingMembership._id },
        { status: 'active', role: invitation.role },
        { new: true }
      )
    : await EventMembership.create({
        eventId: event._id,
        userId: req.userId,
        role: invitation.role,
        status: 'active',
      });

  await ensureEventMember(event, req.userId as string);

  invitation.status = 'accepted';
  await invitation.save();

  // Let the person who sent the invite know it was accepted — previously
  // the inviter had no way to find out short of manually re-checking the
  // team list.
  try {
    await Notification.create({
      userId: invitation.invitedByUserId,
      eventId: event._id,
      title: 'Invitation accepted',
      message: `${user.name || user.email} accepted your invite and joined ${event.name}.`,
      type: 'success',
      createdBy: req.userId,
    });
  } catch (error) {
    console.warn('[notification] Failed to notify inviter of accepted invitation:', error instanceof Error ? error.message : error);
  }

  res.json({ success: true, data: { membership: membership!.toJSON() } });
});

export const declineInvitation = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    throw new AppError('Invalid invitation id', 400, 'VALIDATION_ERROR');
  }

  const invitation = await EventInvitation.findById(id);
  if (!invitation) {
    throw new AppError('Invitation not found', 404, 'NOT_FOUND');
  }

  const user = await User.findById(req.userId);
  if (!user || invitation.email !== user.email) {
    throw new AppError('This invitation was not sent to your account', 403, 'FORBIDDEN');
  }

  if (invitation.status === 'pending') {
    invitation.status = 'declined';
    await invitation.save();
  }

  res.json({ success: true, data: null });
});
