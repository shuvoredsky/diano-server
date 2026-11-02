import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { shippingController } from './shipping.controller';

// ==========================================
// PUBLIC SHIPPING ROUTES
// ==========================================
export const shippingRouter = Router();

// Public delivery method calculation by district
shippingRouter.get('/methods', shippingController.calculateMethods);

// ==========================================
// ADMIN SHIPPING & LOGISTICS ROUTES
// ==========================================
export const adminShippingRouter = Router();

adminShippingRouter.use(authenticate);

// Zones
adminShippingRouter.get(
  '/zones',
  requirePermission('shipping:read', 'shipping:manage'),
  shippingController.listZones,
);
adminShippingRouter.post(
  '/zones',
  requirePermission('shipping:manage'),
  shippingController.createZone,
);
adminShippingRouter.get(
  '/zones/:id',
  requirePermission('shipping:read', 'shipping:manage'),
  shippingController.getZoneById,
);
adminShippingRouter.patch(
  '/zones/:id',
  requirePermission('shipping:manage'),
  shippingController.updateZone,
);
adminShippingRouter.delete(
  '/zones/:id',
  requirePermission('shipping:manage'),
  shippingController.deleteZone,
);

// Methods
adminShippingRouter.get(
  '/methods',
  requirePermission('shipping:read', 'shipping:manage'),
  shippingController.listMethods,
);
adminShippingRouter.post(
  '/methods',
  requirePermission('shipping:manage'),
  shippingController.createMethod,
);
adminShippingRouter.patch(
  '/methods/:id',
  requirePermission('shipping:manage'),
  shippingController.updateMethod,
);
adminShippingRouter.delete(
  '/methods/:id',
  requirePermission('shipping:manage'),
  shippingController.deleteMethod,
);

// Order Shipments
adminShippingRouter.get(
  '/orders/:id/shipments',
  requirePermission('order:read', 'shipping:read'),
  shippingController.getOrderShipment,
);
adminShippingRouter.post(
  '/orders/:id/shipments',
  requirePermission('order:ship', 'shipping:manage'),
  shippingController.createOrderShipment,
);
adminShippingRouter.patch(
  '/orders/:id/shipments/status',
  requirePermission('order:ship', 'shipping:manage'),
  shippingController.updateOrderShipmentStatus,
);
adminShippingRouter.patch(
  '/shipments/:id/status',
  requirePermission('order:ship', 'shipping:manage'),
  shippingController.updateShipmentStatus,
);
