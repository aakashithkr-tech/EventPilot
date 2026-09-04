import { Schema, model, Document, Types } from 'mongoose';

export type MembershipRole = 'owner' | 'admin' | 'lead' | 'developer' | 'researcher' | 'organizer' | 'member';
export type MembershipStatus = 'active' | 'inactive';

export interface IEventMembership extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: Date; // doubles as "joinedAt"
  updatedAt: Date;
}

const MEMBERSHIP_ROLES: MembershipRole[] = [
  'owner',
  'admin',
  'lead',
  'developer',
  'researcher',
  'organizer',
  'member',
];

const eventMembershipSchema = new Schema<IEventMembership>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: MEMBERSHIP_ROLES, default: 'member' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// A user can only have one membership record per event. This is the
// database-level guarantee behind "team membership is event-specific" —
// it's structurally impossible to double-add someone to the same event,
// and nothing here ever spans events.
eventMembershipSchema.index({ eventId: 1, userId: 1 }, { unique: true });

eventMembershipSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;

    // userId may be populated (an object with name/email/avatar) or a bare
    // ObjectId depending on the query. Keep `userId` as a plain string id
    // either way (matches the frontend type), and surface any populated
    // details separately under `user` so nothing has to guess the shape.
    if (ret.userId && typeof ret.userId === 'object' && ret.userId._id) {
      ret.user = {
        id: ret.userId._id.toString(),
        name: ret.userId.name,
        email: ret.userId.email,
        avatar: ret.userId.avatar,
      };
      ret.userId = ret.userId._id.toString();
    } else {
      ret.userId = ret.userId?.toString?.() ?? ret.userId;
    }

    ret.joinedAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const EventMembership = model<IEventMembership>('EventMembership', eventMembershipSchema);
