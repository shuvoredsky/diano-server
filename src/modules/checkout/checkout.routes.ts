import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import { optionalAuthenticate } from '@/middlewares/auth.middleware';
import { checkoutController } from './checkout.controller';

export const checkoutRouter = Router();

// Checkout rate limiter: 60 requests per minute
const checkoutRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many checkout requests. Please slow down.', 429));
  },
  skip: () => env.NODE_ENV === 'test',
});

// Event tracking rate limiter: 120 per minute
const eventRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many event reports. Please slow down.', 429));
  },
  skip: () => env.NODE_ENV === 'test',
});

// All checkout endpoints support optional authentication
checkoutRouter.use(optionalAuthenticate);

// Session lifecycle endpoints
checkoutRouter.post('/sessions', checkoutRateLimiter, checkoutController.createSession);
checkoutRouter.get('/sessions/:id', checkoutController.getSession);

// Progressive step updates
checkoutRouter.patch('/sessions/:id/customer-info', checkoutRateLimiter, checkoutController.updateCustomerInfo);
checkoutRouter.patch('/sessions/:id/shipping-info', checkoutRateLimiter, checkoutController.updateShippingInfo);
checkoutRouter.patch('/sessions/:id/delivery-method', checkoutRateLimiter, checkoutController.updateDeliveryMethod);
checkoutRouter.patch('/sessions/:id/payment-method', checkoutRateLimiter, checkoutController.updatePaymentMethod);

// Event telemetry
checkoutRouter.post('/sessions/:id/events', eventRateLimiter, checkoutController.recordEvent);
