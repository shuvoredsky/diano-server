import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { abandonedCheckoutController } from './abandoned-checkout.controller';

export const abandonedCheckoutRouter = Router();

// All abandoned checkout management endpoints require authentication
abandonedCheckoutRouter.use(authenticate);

// List & Stats (Must be registered before parameter routes)
abandonedCheckoutRouter.get(
  '/',
  requirePermission('abandoned_checkout:read'),
  abandonedCheckoutController.getAbandonedCheckouts,
);

abandonedCheckoutRouter.get(
  '/stats',
  requirePermission('abandoned_checkout:read'),
  abandonedCheckoutController.getStats,
);

// Single Item & Action Endpoints
abandonedCheckoutRouter.get(
  '/:id',
  requirePermission('abandoned_checkout:read'),
  abandonedCheckoutController.getById,
);

abandonedCheckoutRouter.post(
  '/:id/recovery',
  requirePermission('abandoned_checkout:manage'),
  abandonedCheckoutController.triggerRecovery,
);
