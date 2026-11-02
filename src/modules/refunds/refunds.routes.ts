import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { refundsController } from './refunds.controller';

export const adminRefundsRouter = Router();

adminRefundsRouter.use(authenticate);

adminRefundsRouter.get(
  '/',
  requirePermission('refund:read', 'refund:approve'),
  refundsController.listRefunds,
);
adminRefundsRouter.get(
  '/:id',
  requirePermission('refund:read', 'refund:approve'),
  refundsController.getRefundById,
);
adminRefundsRouter.post(
  '/orders/:id/refunds',
  requirePermission('refund:approve'),
  refundsController.executeOrderRefund,
);
adminRefundsRouter.post(
  '/returns/:id/refund',
  requirePermission('refund:approve'),
  refundsController.executeReturnRefund,
);
