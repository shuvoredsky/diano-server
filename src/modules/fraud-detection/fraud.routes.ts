import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { fraudController } from './fraud.controller';

export const adminFraudRouter = Router();

// Enforce authentication across all admin fraud routes
adminFraudRouter.use(authenticate);

// 1. Rules configuration
adminFraudRouter.get(
  '/rules',
  requirePermission('fraud:manage', 'fraud:read'),
  fraudController.getRules,
);

adminFraudRouter.patch(
  '/rules/:key',
  requirePermission('fraud:manage'),
  fraudController.updateRule,
);

// 2. Stats
adminFraudRouter.get(
  '/stats',
  requirePermission('fraud:read', 'fraud:manage'),
  fraudController.getStats,
);

// 3. Review Queue
adminFraudRouter.get(
  '/reviews',
  requirePermission('fraud:review', 'fraud:manage'),
  fraudController.listReviews,
);

adminFraudRouter.get(
  '/reviews/:id',
  requirePermission('fraud:review', 'fraud:manage'),
  fraudController.getReviewDetail,
);

adminFraudRouter.post(
  '/reviews/:id/approve',
  requirePermission('fraud:review', 'fraud:manage'),
  fraudController.approveReview,
);

adminFraudRouter.post(
  '/reviews/:id/reject',
  requirePermission('fraud:review', 'fraud:manage'),
  fraudController.rejectReview,
);

adminFraudRouter.post(
  '/reviews/:id/request-otp',
  requirePermission('fraud:review', 'fraud:manage'),
  fraudController.requestOtp,
);

adminFraudRouter.post(
  '/reviews/:id/verify-otp',
  requirePermission('fraud:review', 'fraud:manage'),
  fraudController.verifyOtp,
);
