import { Schema, model, Document, Types } from 'mongoose';

export type EventUpdateType = 'deadline-change' | 'requirement-added' | 'announcement';

export interface IEventUpdate extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  type: EventUpdateType;
  title: string;
  description: string;
  metadata?: {
    oldValue?: string;
    newValue?: string;
  };
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const eventUpdateSchema = new Schema<IEventUpdate>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    type: { type: String, enum: ['deadline-change', 'requirement-added', 'announcement'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    metadata: {
      oldValue: { type: String },
      newValue: { type: String },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

eventUpdateSchema.index({ eventId: 1, createdAt: -1 });

eventUpdateSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;
    ret.createdBy = ret.createdBy?.toString?.() ?? ret.createdBy;
    // The frontend's existing EventUpdate type reads `timestamp`, not
    // `createdAt` — expose both rather than renaming the underlying field.
    ret.timestamp = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
    if (ret.metadata && ret.metadata.oldValue === undefined && ret.metadata.newValue === undefined) {
      ret.metadata = undefined;
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const EventUpdate = model<IEventUpdate>('EventUpdate', eventUpdateSchema);
