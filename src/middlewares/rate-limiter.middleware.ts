import rateLimit from 'express-rate-limit';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';

export const baseRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many requests from this IP, please try again later.', 429));
  },
  skip: () => env.NODE_ENV === 'test',
});
