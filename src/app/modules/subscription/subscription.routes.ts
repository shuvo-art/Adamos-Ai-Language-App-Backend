import express, { Request, Response, RequestHandler } from 'express';
import Stripe from 'stripe';
import { Subscription } from './subscription.model';
import { User } from '../user/user.model';
import jwt from 'jsonwebtoken';

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


router.get(
  '/stripe-success',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { session_id } = req.query;

      // Retrieve the session from Stripe to get the metadata (userId)
      const session = await stripe.checkout.sessions.retrieve(session_id as string);

      // Extract the userId from the session metadata
      const userId = session.metadata?.userId;
      if (!userId) {
        res.status(400).json({ success: false, message: 'User ID not found in session metadata.' });
        return;
      }

      // Verify the token and extract user information
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        res.status(401).json({ success: false, message: 'No token provided.' });
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      if (decoded.userId !== userId) {
        res.status(403).json({ success: false, message: 'Unauthorized access.' });
        return;
      }

      // Calculate subscription start and end dates
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // One month from now

      // Create or update the subscription in the database
      await Subscription.findOneAndUpdate(
        { user: userId },
        {
          user: userId,
          type: 'Premium',
          startDate,
          endDate,
        },
        { upsert: true, new: true } // Create if it doesn't exist, update if it does
      );

      // Respond with success
      res.status(200).json({ success: true, message: 'Subscription successful!' });
    } catch (error: any) {
      console.error('Stripe success error:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);


router.get(
  '/stripe-cancel',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { session_id } = req.query;

      // Retrieve the session from Stripe to get the metadata (userId)
      const session = await stripe.checkout.sessions.retrieve(session_id as string);

      // Extract the userId from the session metadata
      const userId = session.metadata?.userId;
      if (!userId) {
        res.status(400).json({ success: false, message: 'User ID not found in session metadata.' });
        return;
      }

      // Verify the token and extract user information
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        res.status(401).json({ success: false, message: 'No token provided.' });
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      if (decoded.userId !== userId) {
        res.status(403).json({ success: false, message: 'Unauthorized access.' });
        return;
      }

      // Log the cancellation or perform any other necessary actions
      console.log(`User ${userId} canceled the subscription.`);

      // Respond with cancellation message
      res.status(200).json({ success: true, message: 'Subscription canceled.' });
    } catch (error: any) {
      console.error('Stripe cancel error:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);


// Create Stripe session for Premium subscription
router.post('/stripe-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(400).json({ success: false, message: 'User ID is missing.' });
      return;
    }

    console.log('User ID:', userId);

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
      success_url: `https://wildcat-proud-pipefish.ngrok-free.app/api/subscription/stripe-success`,
      cancel_url: `https://wildcat-proud-pipefish.ngrok-free.app/api/subscription/stripe-cancel`,
      
      // ✅ Ensure metadata is passed to payment intent
      payment_intent_data: {
        metadata: {
          userId: String(userId),  // ✅ Ensure metadata is a string
        },
      },
    
      // ✅ Metadata in checkout session
      metadata: {
        userId: String(userId),
      },
    });

    console.log('Session Metadata:', session.metadata);  // ✅ Debugging metadata

    res.status(200).json({ success: true, sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Stripe session error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

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

router.get('/details', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      res.status(401).json({ success: false, message: 'Unauthorized: No token provided.' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    const userId = decoded.id;

    const subscription = await Subscription.findOne({ user: userId });

    if (!subscription) {
      res.status(404).json({ success: false, message: 'No subscription found for this user.' });
      return;
    }

    res.status(200).json({ 
      success: true, 
      subscription 
    });
  } catch (error: any) {
    console.error('Error fetching subscription:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;