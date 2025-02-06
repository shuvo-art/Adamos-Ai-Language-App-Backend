import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: string;
  profileImage?: string;
  language?: string;
  plan: 'Free' | 'Premium' | null; 
  dailyGoal?: number | null; // Default to null
  expertiseLevel?: 'Beginner' | 'Intermediate' | 'Advanced' | null; // Default to null
}

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    profileImage: { type: String },
    language: { type: String,  default: null, nullable: true },
    plan: { type: String, enum: ['Free', 'Premium'], default: 'Free' },
    dailyGoal: { type: Number, enum: [15, 30, 45, 50, 90, 120], default: null, nullable: true }, // Default to null
    expertiseLevel: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: null, nullable: true }, // Default to null
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
