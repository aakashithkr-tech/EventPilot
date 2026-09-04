import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { signToken } from '../utils/jwt';
import { AppError, asyncHandler } from '../middleware/errorMiddleware';
import { AuthedRequest } from '../middleware/authMiddleware';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export const register = asyncHandler(async (req, res: Response) => {
  const { name, email, password, confirmPassword } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new AppError('Name is required', 400, 'VALIDATION_ERROR');
  }
  if (!email || !isValidEmail(email)) {
    throw new AppError('A valid email is required', 400, 'VALIDATION_ERROR');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400, 'VALIDATION_ERROR');
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new AppError('Passwords do not match', 400, 'VALIDATION_ERROR');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('Email already registered', 409, 'CONFLICT');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    avatar: name.trim().charAt(0).toUpperCase(),
  });

  const token = signToken({ userId: user._id.toString() });

  res.status(201).json({
    success: true,
    data: { user: user.toJSON(), token },
  });
});

export const login = asyncHandler(async (req, res: Response) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
  }

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  if (!user) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  const token = signToken({ userId: user._id.toString() });

  res.json({
    success: true,
    data: { user: user.toJSON(), token },
  });
});

export const me = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  res.json({ success: true, data: { user: user.toJSON() } });
});

export const logout = asyncHandler(async (_req, res: Response) => {
  // JWTs are stateless; logout is handled client-side by discarding the token.
  // This endpoint exists for a consistent API contract (and to support a future token blocklist).
  res.json({ success: true, data: null });
});
