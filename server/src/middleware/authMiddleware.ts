import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import { AppError } from './errorMiddleware';

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      throw new AppError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new AppError('Invalid or expired session', 401, 'UNAUTHORIZED');
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      throw new AppError('User no longer exists', 401, 'UNAUTHORIZED');
    }

    req.userId = user._id.toString();
    next();
  } catch (err) {
    next(err);
  }
}
