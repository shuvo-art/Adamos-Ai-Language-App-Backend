import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { User, IUser } from '../user/user.model';

export const registerUser = async (email: string, password: string, name: string) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({
    email,
    password: hashedPassword,
    name,
  });
  return newUser.save();
};

export const loginUser = async (email: string, password: string) => {
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error('Invalid email or password');
  }
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET as string, {
    expiresIn: '1h',
  });
  return { user, token, role: user.role }; // Include the role in the response
};


const otpMap = new Map<string, string>();

export const generateOTP = async (email: string) => {
  const otp = crypto.randomInt(1000, 9999).toString();
  otpMap.set(email, otp);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset OTP',
    text: `Your OTP for password reset is ${otp}.`,
  });

  return otp;
};

export const verifyOTP = (email: string, otp: string) => {
  const validOTP = otpMap.get(email);
  if (validOTP === otp) {
    otpMap.delete(email);
    return true;
  }
  return false;
};

const refreshTokens: string[] = [];

export const generateAccessToken = (user: IUser) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

export const generateRefreshToken = (user: IUser) => {
  const refreshToken = jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN_SECRET as string, { expiresIn: '7d' });
  refreshTokens.push(refreshToken);
  return refreshToken;
};

export const verifyRefreshToken = (token: string) => {
  try {
    return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET as string);
  } catch {
    return null;
  }
};
