import express, { Request, Response, RequestHandler } from 'express';
import Stripe from 'stripe';
import { Subscription } from './subscription.model';
import { User } from '../user/user.model';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-12-18.acacia',
});

interface Params {
  userId: string; // Define the userId parameter explicitly
}

interface StripeSessionRequest {
  successUrl: string;
  cancelUrl: string;
}

// Middleware to set default subscription to Free on user login
router.post('/initialize/:userId', async (req: Request<Params>, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const existingSubscription = await Subscription.findOne({ user: userId });
    if (existingSubscription) {
      res.status(400).json({ success: false, message: 'User already has a subscription.' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    user.plan = 'Free';
    await user.save();

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + 1);

    const subscription = new Subscription({ user: userId, type: 'Free', startDate, endDate });
    await subscription.save();

    res.status(201).json({ success: true, subscription });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Stripe session for Premium subscription
router.post(
  '/stripe-session',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, successUrl, cancelUrl } = req.body;

      if (!successUrl || !cancelUrl || !userId) {
        res.status(400).json({ success: false, message: "Missing required parameters: 'successUrl', 'cancelUrl', or 'userId'." });
        return;
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Premium Subscription',
                description: 'One-month Premium subscription for $12',
              },
              unit_amount: 1200,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
        },
      });

      res.status(200).json({ success: true, sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error('Stripe session error:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Renew Premium subscription
router.put(
  '/:userId/renew',
  (async (req: Request<Params>, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user || user.plan !== 'Premium') {
        res.status(404).json({ success: false, message: 'No active Premium subscription found for renewal.' });
        return;
      }

      const subscription = await Subscription.findOne({ user: userId });
      if (!subscription) {
        res.status(404).json({ success: false, message: 'Subscription not found.' });
        return;
      }

      const currentDate = new Date();
      if (subscription.endDate > currentDate) {
        res.status(400).json({ success: false, message: 'Subscription is still active.' });
        return;
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(startDate.getMonth() + 1);

      subscription.startDate = startDate;
      subscription.endDate = endDate;
      await subscription.save();

      res.status(200).json({ success: true, subscription });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }) as RequestHandler<Params>
);

export default router;