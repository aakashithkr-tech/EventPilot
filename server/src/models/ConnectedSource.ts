import { Schema, model, Document, Types } from 'mongoose';

export type ConnectedSourceType = 'gmail' | 'whatsapp';
export type ConnectedSourceStatus = 'active' | 'revoked' | 'error';

export interface IConnectedSource extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  type: ConnectedSourceType;
  status: ConnectedSourceStatus;
  displayName: string;
  externalId?: string;
  encryptedRefreshToken?: string;
  senderEmails: string[];
  matchKeywords: string[];
  lastSyncedAt?: Date;
  lastMessageAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const connectedSourceSchema = new Schema<IConnectedSource>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['gmail', 'whatsapp'], required: true },
    status: { type: String, enum: ['active', 'revoked', 'error'], default: 'active' },
    displayName: { type: String, required: true, trim: true, maxlength: 200 },
    externalId: { type: String, trim: true, maxlength: 300 },
    // OAuth refresh tokens are encrypted before they reach MongoDB.
    encryptedRefreshToken: { type: String, select: false },
    senderEmails: [{ type: String, trim: true, lowercase: true, maxlength: 320 }],
    matchKeywords: [{ type: String, trim: true, maxlength: 120 }],
    lastSyncedAt: Date,
    lastMessageAt: Date,
    lastError: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

connectedSourceSchema.index({ eventId: 1, type: 1 });
connectedSourceSchema.index({ userId: 1, eventId: 1, type: 1 });

connectedSourceSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;
    ret.userId = ret.userId?.toString?.() ?? ret.userId;
    delete ret._id;
    delete ret.__v;
    delete ret.encryptedRefreshToken;
    return ret;
  },
});

export const ConnectedSource = model<IConnectedSource>('ConnectedSource', connectedSourceSchema);
