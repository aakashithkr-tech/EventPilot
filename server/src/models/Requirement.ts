import { Schema, model, Document, Types } from 'mongoose';

export interface IRequirement extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  title: string;
  completed: boolean;
  description?: string;
  requiredBy: string;
  sourceLink?: string;
  verified: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const requirementSchema = new Schema<IRequirement>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    completed: { type: Boolean, default: false },
    description: { type: String, trim: true, maxlength: 2000 },
    requiredBy: { type: String, required: true, trim: true, maxlength: 200 },
    sourceLink: { type: String, trim: true, maxlength: 1000 },
    verified: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

requirementSchema.index({ eventId: 1, completed: 1 });

requirementSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;
    ret.createdBy = ret.createdBy?.toString?.() ?? ret.createdBy;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Requirement = model<IRequirement>('Requirement', requirementSchema);
