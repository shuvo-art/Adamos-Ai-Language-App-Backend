import { Request, Response } from 'express';
import { User } from '../user/user.model';
import { ChatHistory } from '../chatbot/chatHistory.model';

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    // Fetch all users and user growth data
    const users = await User.find().select('name email role createdAt');
    const monthlyUserGrowth = await User.aggregate([
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    res.status(200).json({
      success: true,
      users,
      growth: monthlyUserGrowth,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

export const getUserDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    // Fetch user details
    const user = await User.findById(userId).select('-password');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    // Fetch user's chat history
    const chatHistory = await ChatHistory.find({ userId }).select('chat_name chat_contents timestamps');

    res.status(200).json({
      success: true,
      user,
      chatHistory,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};


export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    // Check if the conversation exists
    const conversation = await ChatHistory.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found.' });
      return;
    }

    // Delete the conversation
    await ChatHistory.findByIdAndDelete(conversationId);

    res.status(200).json({ success: true, message: 'Conversation deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};