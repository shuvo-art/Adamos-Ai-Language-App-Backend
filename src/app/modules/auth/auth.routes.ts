import express, { Request, Response, RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { registerUser, loginUser, generateOTP, verifyOTP, generateAccessToken, generateRefreshToken, verifyRefreshToken } from './auth.service';
import { User } from '../user/user.model';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const otpRequestSchema = z.object({
  email: z.string().email(),
  otp: z.string().optional(), // Updated to allow OTP field
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string(),
  newPassword: z.string().min(8),
});

const refreshTokenSchema = z.object({
  token: z.string(),
});

let refreshTokens: string[] = [];

// OTP cache for verification
const otpCache = new Map<string, string>();

// Signup route
router.post(
  '/signup',
  (async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, name } = signupSchema.parse(req.body);
      const user = await registerUser(email, password, name);
      res.status(201).json({ success: true, user });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }) as RequestHandler
);

// Login route
router.post(
  '/login',
  (async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await User.findOne({ email });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        res.status(401).json({ success: false, message: 'Invalid email or password' });
        return;
      }

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      refreshTokens.push(refreshToken); // Save the refresh token

      res.status(200).json({
        success: true,
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          language: user.language,
          profileImage: user.profileImage,
        },
        accessToken,
        refreshToken,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }) as RequestHandler
);

// Send OTP for password reset
router.post(
  '/password/reset',
  (async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = otpRequestSchema.parse(req.body);
      const otp = await generateOTP(email);
      otpCache.set(email, otp); // Cache OTP for further verification
      res.status(200).json({ success: true, message: 'OTP sent to email' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }) as RequestHandler
);

// Verify OTP
router.post(
  '/verify-otp',
  (async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, otp } = otpRequestSchema.parse(req.body);
      const cachedOTP = otpCache.get(email);

      if (!cachedOTP || cachedOTP !== otp) {
        res.status(400).json({ success: false, message: 'Invalid OTP' });
        return;
      }

      res.status(200).json({ success: true, message: 'OTP verified successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }) as RequestHandler
);

// Verify OTP and reset password
router.post(
  '/password/reset/verify',
  (async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, otp, newPassword } = resetPasswordSchema.parse(req.body);
      const cachedOTP = otpCache.get(email);

      if (!cachedOTP || cachedOTP !== otp) {
        res.status(400).json({ success: false, message: 'Invalid OTP' });
        return;
      }

      otpCache.delete(email); // Remove OTP from cache after successful verification
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await User.findOneAndUpdate({ email }, { password: hashedPassword });
      res.status(200).json({ success: true, message: 'Password reset successful' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }) as RequestHandler
);



// Refresh token route
router.post(
  '/refresh-token',
  (async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = refreshTokenSchema.parse(req.body);

      if (!refreshTokens.includes(token)) {
        res.status(403).json({ success: false, message: 'Refresh token is invalid' });
        return;
      }

      const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET as string) as { id: string };
      const user = await User.findById(decoded.id);

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const accessToken = generateAccessToken(user);

      res.status(200).json({ success: true, accessToken });
    } catch (error: any) {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
  }) as RequestHandler
);

// Logout route
router.post('/logout', (req: Request, res: Response): void => {
  const { token } = req.body;

  refreshTokens = refreshTokens.filter((t) => t !== token); // Invalidate the refresh token
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});


export default router;
