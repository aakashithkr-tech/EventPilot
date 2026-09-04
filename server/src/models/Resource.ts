import { Schema, model, Document, Types } from 'mongoose';

export type ResourceType = 'template' | 'document' | 'link';

export interface IResource extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  name: string;
  type: ResourceType;
  fileType: string;
  source: string;
  url: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<IResource>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 300 },
    type: { type: String, enum: ['template', 'document', 'link'], required: true },
    fileType: { type: String, required: true, trim: true, maxlength: 50 },
    source: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, required: true, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

resourceSchema.index({ eventId: 1, type: 1 });

resourceSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;
    ret.createdBy = ret.createdBy?.toString?.() ?? ret.createdBy;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Resource = model<IResource>('Resource', resourceSchema);
