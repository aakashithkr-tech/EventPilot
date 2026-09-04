import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  avatar?: string;
  role?: string;
  preferences: {
    darkMode: boolean;
    emailNotifications: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String },
    role: { type: String, default: 'member' },
    preferences: {
      darkMode: { type: Boolean, default: true },
      emailNotifications: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

// Never leak passwordHash even if select() is misused
userSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    delete ret.passwordHash;
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const User = model<IUser>('User', userSchema);
