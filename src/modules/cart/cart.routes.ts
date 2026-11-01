import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import { optionalAuthenticate, authenticate } from '@/middlewares/auth.middleware';
import { cartController } from './cart.controller';

export const cartRouter = Router();

// Guest and mutation rate limiter (60 actions / minute)
const cartRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many cart actions, please slow down.', 429));
  },
  skip: () => env.NODE_ENV === 'test',
});

// All cart routes support optional authentication (except merge which requires auth)
cartRouter.use(optionalAuthenticate);

// Fixed actions
cartRouter.get('/', cartController.getCart);
cartRouter.delete('/', cartRateLimiter, cartController.clearCart);
cartRouter.post('/items', cartRateLimiter, cartController.addItem);
cartRouter.post('/validate', cartRateLimiter, cartController.validateCart);

// Merge requires logged-in user
cartRouter.post('/merge', authenticate, cartRateLimiter, cartController.mergeCart);

// Parametric item actions
cartRouter.patch('/items/:variantId', cartRateLimiter, cartController.updateItem);
cartRouter.delete('/items/:variantId', cartRateLimiter, cartController.removeItem);
