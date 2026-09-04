import { Schema, model, Document, Types } from 'mongoose';

export type DeadlineType = 'official' | 'ai-recommended' | 'personal' | 'team';

export interface IDeadline extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  title: string;
  date: Date;
  type: DeadlineType;
  verified: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const deadlineSchema = new Schema<IDeadline>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    date: { type: Date, required: true },
    type: { type: String, enum: ['official', 'ai-recommended', 'personal', 'team'], default: 'official' },
    verified: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

deadlineSchema.index({ eventId: 1, type: 1 });
deadlineSchema.index({ eventId: 1, date: 1 });

deadlineSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;
    ret.createdBy = ret.createdBy?.toString?.() ?? ret.createdBy;
    // Date-only string, same display convention as Task.dueDate — the
    // frontend's existing Deadline.date field is a 'YYYY-MM-DD' string.
    ret.date = ret.date instanceof Date ? ret.date.toISOString().slice(0, 10) : ret.date;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Deadline = model<IDeadline>('Deadline', deadlineSchema);
