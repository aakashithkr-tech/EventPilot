import { Schema, model, Document, Types } from 'mongoose';

export type EventStatus = 'on-track' | 'needs-attention' | 'at-risk';
export type EventTypeEnum = 'hackathon' | 'competition' | 'conference' | 'workshop';

export interface IEvent extends Document {
  _id: Types.ObjectId;
  name: string;
  type: EventTypeEnum;
  description: string;
  websiteUrl?: string;
  status: EventStatus;
  finalDeadline: Date;
  progress: number;
  healthScore: number;
  teamSize: number;
  nextAction: string;
  ownerId: Types.ObjectId;
  members: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<IEvent>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: {
      type: String,
      required: true,
      enum: ['hackathon', 'competition', 'conference', 'workshop'],
    },
    description: { type: String, default: '', trim: true, maxlength: 5000 },
    websiteUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: ['on-track', 'needs-attention', 'at-risk'],
      default: 'on-track',
    },
    finalDeadline: { type: Date, required: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    healthScore: { type: Number, default: 100, min: 0, max: 100 },
    teamSize: { type: Number, default: 1, min: 1, max: 50 },
    nextAction: { type: String, default: '', maxlength: 300 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
  },
  { timestamps: true }
);

// An event's owner always implicitly counts as authorized; `members` lets
// us extend real team-based access in the Team Management feature without
// another migration.
eventSchema.index({ ownerId: 1, createdAt: -1 });

eventSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.finalDeadline = ret.finalDeadline instanceof Date ? ret.finalDeadline.toISOString() : ret.finalDeadline;
    ret.ownerId = ret.ownerId?.toString?.() ?? ret.ownerId;
    ret.members = (ret.members || []).map((m: any) => m.toString?.() ?? m);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Event = model<IEvent>('Event', eventSchema);
