import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { Subscription } from './subscription.model';
import { User } from '../user/user.model';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-12-18.acacia',
});

// Stripe webhook to handle successful payments
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('Headers:', req.headers);
      console.log('Raw Body:', req.body);
      // Ensure the body is a raw buffer
      const sig = req.headers['stripe-signature'];
      if (!sig) {
        throw new Error('Stripe-Signature header is missing');
      }

      console.log('Signature:', sig);
      
      const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body);
      const event = stripe.webhooks.constructEvent(
        rawBody, // Ensure raw buffer
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET as string
      );
  
      console.log('Event:', event);
  
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
  
        if (!userId) {
          throw new Error('User ID is missing in session metadata');
        }
  
        const user = await User.findById(userId);
        if (!user) {
          throw new Error('User not found');
        }
  
        user.plan = 'Premium';
        await user.save();
  
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(startDate.getMonth() + 1);
  
        const subscription = await Subscription.findOneAndUpdate(
          { user: userId },
          { type: 'Premium', startDate, endDate },
          { new: true, upsert: true }
        );
  
        res.status(200).json({ success: true, subscription });
      } else {
        res.status(400).json({ success: false, message: 'Unhandled event type' });
      }
    } catch (error: any) {
      console.error('Webhook error:', error.message, error.stack);
      res.status(400).json({ success: false, message: error.message });
    }
  });

export default router;
