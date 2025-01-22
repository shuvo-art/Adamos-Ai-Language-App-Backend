import express from 'express';
import { getAllUsers, getUserDetails, deleteConversation } from './dashboard.controller';
import { requireRole } from '../auth/auth.middleware';

const router = express.Router();

// Route to fetch all users with growth data (Admin-only)
router.get('/users', requireRole('admin'), getAllUsers);

// Route to fetch a specific user's details and chat history (Admin-only)
router.get('/user/:userId', requireRole('admin'), getUserDetails);

// Route to delete a specific conversation (Admin-only)
router.delete('/conversation/:conversationId', requireRole('admin'), deleteConversation);

export default router;
