import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { returnsController } from './returns.controller';
import { refundsController } from '@/modules/refunds/refunds.controller';

// ==========================================
// CUSTOMER & PUBLIC RETURN ROUTES
// ==========================================
export const customerReturnsRouter = Router();

customerReturnsRouter.get('/reasons', returnsController.listReturnReasons);
customerReturnsRouter.post('/orders/:id/returns', authenticate, returnsController.requestReturn);
customerReturnsRouter.get('/orders/returns/my', authenticate, returnsController.getMyReturns);

// ==========================================
// ADMIN RETURN MANAGEMENT ROUTES
// ==========================================
export const adminReturnsRouter = Router();

adminReturnsRouter.use(authenticate);

adminReturnsRouter.get(
  '/',
  requirePermission('return:read', 'return:manage'),
  returnsController.listReturns,
);
adminReturnsRouter.get(
  '/:id',
  requirePermission('return:read', 'return:manage'),
  returnsController.getReturnById,
);
adminReturnsRouter.post(
  '/:id/review',
  requirePermission('return:manage'),
  returnsController.reviewReturn,
);
adminReturnsRouter.post(
  '/:id/receive',
  requirePermission('return:manage'),
  returnsController.receiveAndInspectReturn,
);
adminReturnsRouter.post(
  '/:id/refund',
  requirePermission('refund:approve', 'return:manage'),
  refundsController.executeReturnRefund,
);
