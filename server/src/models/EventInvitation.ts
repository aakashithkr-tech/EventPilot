import { Schema, model, Document, Types } from 'mongoose';
import { MembershipRole } from './EventMembership';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface IEventInvitation extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  email: string;
  invitedByUserId: Types.ObjectId;
  role: MembershipRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Owners aren't invited — every event already has exactly one at creation.
const INVITABLE_ROLES: MembershipRole[] = ['admin', 'lead', 'developer', 'researcher', 'organizer', 'member'];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const eventInvitationSchema = new Schema<IEventInvitation>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: INVITABLE_ROLES, default: 'member' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    expiresAt: { type: Date, default: () => new Date(Date.now() + SEVEN_DAYS_MS) },
  },
  { timestamps: true }
);

eventInvitationSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();

    if (ret.eventId && typeof ret.eventId === 'object' && ret.eventId._id) {
      ret.event = { id: ret.eventId._id.toString(), name: ret.eventId.name, type: ret.eventId.type };
      ret.eventId = ret.eventId._id.toString();
    } else {
      ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;
    }

    ret.invitedByUserId = ret.invitedByUserId?.toString?.() ?? ret.invitedByUserId;
    ret.expiresAt = ret.expiresAt instanceof Date ? ret.expiresAt.toISOString() : ret.expiresAt;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const EventInvitation = model<IEventInvitation>('EventInvitation', eventInvitationSchema);
export { INVITABLE_ROLES };
