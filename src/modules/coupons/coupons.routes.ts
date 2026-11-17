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
adminFlashSalesRouter.get(
  '/',
  requirePermission('coupon:read', 'coupon:manage'),
  couponsController.listAdminFlashSales,
);
adminFlashSalesRouter.get(
  '/:id',
  requirePermission('coupon:read', 'coupon:manage'),
  couponsController.getFlashSaleById,
);
adminFlashSalesRouter.post(
  '/',
  requirePermission('coupon:manage'),
  couponsController.createFlashSale,
);
adminFlashSalesRouter.patch(
  '/:id',
  requirePermission('coupon:manage'),
  couponsController.updateFlashSale,
);
adminFlashSalesRouter.post(
  '/:id/cancel',
  requirePermission('coupon:manage'),
  couponsController.cancelFlashSale,
);
adminFlashSalesRouter.delete(
  '/:id',
  requirePermission('coupon:manage'),
  couponsController.deleteFlashSale,
);

export const publicFlashSalesRouter = Router();
publicFlashSalesRouter.get('/', couponsController.listActiveFlashSales);
