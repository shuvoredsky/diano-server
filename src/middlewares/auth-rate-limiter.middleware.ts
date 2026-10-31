import rateLimit from 'express-rate-limit';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';

// Strict in-memory rate limiter for sensitive authentication endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 15, // max 15 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many authentication attempts. Please try again after 15 minutes.', 429));
  },
  skip: () => env.NODE_ENV === 'test',
});

// Slightly more lenient rate limiter for refresh token endpoint
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // max 60 refreshes per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many token refresh attempts. Please slow down.', 429));
  },
  skip: () => env.NODE_ENV === 'test',
});
