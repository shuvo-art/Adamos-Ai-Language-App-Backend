import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscription extends Document {
  user: mongoose.Types.ObjectId;
  type: 'Free' | 'Premium';
  startDate: Date;
  endDate: Date;
}

const SubscriptionSchema: Schema = new Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['Free', 'Premium'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
