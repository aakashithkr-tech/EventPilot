import { Schema, model, Document, Types } from 'mongoose';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface ITask extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  title: string;
  description?: string;
  assigneeId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  dueDate?: Date;
  priority: TaskPriority;
  status: TaskStatus;
  // Requirements aren't a real model yet (still mock/local state on the
  // frontend), so this stays a loose string id rather than a ref — it's
  // wired up for real once Requirements is migrated.
  requirementId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['todo', 'in-progress', 'done'], default: 'todo' },
    requirementId: { type: String },
  },
  { timestamps: true }
);

taskSchema.index({ eventId: 1, status: 1 });
taskSchema.index({ eventId: 1, assigneeId: 1 });

taskSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.eventId = ret.eventId?.toString?.() ?? ret.eventId;
    ret.createdBy = ret.createdBy?.toString?.() ?? ret.createdBy;

    // assigneeId may be populated (object with name/email/avatar) or a bare
    // ObjectId depending on the query. Keep `assigneeId` as a plain string
    // id either way, surfacing populated details under `assignee` — same
    // pattern as EventMembership's `user`.
    if (ret.assigneeId && typeof ret.assigneeId === 'object' && ret.assigneeId._id) {
      ret.assignee = {
        id: ret.assigneeId._id.toString(),
        name: ret.assigneeId.name,
        email: ret.assigneeId.email,
        avatar: ret.assigneeId.avatar,
      };
      ret.assigneeId = ret.assigneeId._id.toString();
    } else if (ret.assigneeId) {
      ret.assigneeId = ret.assigneeId.toString();
    }

    ret.dueDate = ret.dueDate instanceof Date ? ret.dueDate.toISOString().slice(0, 10) : ret.dueDate;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Task = model<ITask>('Task', taskSchema);
