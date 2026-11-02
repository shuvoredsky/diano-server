import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { couponsController } from './coupons.controller';

// ==========================================
// ADMIN COUPONS ROUTER
// ==========================================
export const adminCouponsRouter = Router();

adminCouponsRouter.use(authenticate);

adminCouponsRouter.get(
  '/',
  requirePermission('coupon:read', 'coupon:manage'),
  couponsController.listCoupons,
);
adminCouponsRouter.post(
  '/',
  requirePermission('coupon:manage'),
  couponsController.createCoupon,
);
adminCouponsRouter.get(
  '/:id',
  requirePermission('coupon:read', 'coupon:manage'),
  couponsController.getCouponById,
);
adminCouponsRouter.patch(
  '/:id',
  requirePermission('coupon:manage'),
  couponsController.updateCoupon,
);
adminCouponsRouter.delete(
  '/:id',
  requirePermission('coupon:manage'),
  couponsController.deleteCoupon,
);

// ==========================================
// FLASH SALES ROUTERS
// ==========================================
export const adminFlashSalesRouter = Router();

adminFlashSalesRouter.use(authenticate);
adminFlashSalesRouter.post(
  '/',
  requirePermission('coupon:manage'),
  couponsController.createFlashSale,
);

export const publicFlashSalesRouter = Router();
publicFlashSalesRouter.get('/', couponsController.listActiveFlashSales);
