import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType = 'critical' | 'warning' | 'info' | 'success';

export interface INotification extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  eventId?: Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  /**
   * Deduplication key for preparation-aware smart alerts (e.g.
   * "<eventId>-smart-15d"). When present, a given user can only ever have
   * one notification with this key — enforced by the unique index below,
   * not just app-logic — so re-running the smart-notification generator
   * never spams duplicates even across server restarts/multiple callers.
   */
  milestoneKey?: string;
  /** Present when this notification represents an actionable team invitation. */
  invitationId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    type: { type: String, enum: ['critical', 'warning', 'info', 'success'], required: true },
    read: { type: Boolean, default: false },
    milestoneKey: { type: String, trim: true, maxlength: 200 },
    invitationId: { type: Schema.Types.ObjectId, ref: 'EventInvitation', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

// A user can only have one notification per milestoneKey (when set) — this
// is what makes the smart-notification generator idempotent: calling it
// repeatedly, from any team member's session, can never create duplicate
// alerts for the same user + milestone. Partial index so notifications
// without a milestoneKey (manual/one-off alerts) are unaffected.
notificationSchema.index(
  { userId: 1, milestoneKey: 1 },
  { unique: true, partialFilterExpression: { milestoneKey: { $type: 'string' } } }
);

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  return `${diffDay}d ago`;
}

notificationSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;
    ret.userId = ret.userId?.toString?.() ?? ret.userId;
    ret.createdBy = ret.createdBy?.toString?.() ?? ret.createdBy;
    ret.invitationId = ret.invitationId?.toString?.() ?? ret.invitationId;
    ret.timestamp = ret.createdAt instanceof Date ? formatRelativeTime(ret.createdAt) : 'Just now';
    if (!ret.milestoneKey) delete ret.milestoneKey;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Notification = model<INotification>('Notification', notificationSchema);
