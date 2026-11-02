import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import { authenticate, optionalAuthenticate, requirePermission } from '@/middlewares/auth.middleware';
import { ordersController } from './orders.controller';
import { shippingController } from '@/modules/shipping/shipping.controller';

export const ordersRouter = Router();
export const adminOrdersRouter = Router();

// Order creation rate limiter: 60 requests per minute
const orderCreateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many order requests. Please slow down.', 429));
  },
  skip: () => env.NODE_ENV === 'test',
});

// Order tracking rate limiter: 30 requests per minute
const trackingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many tracking requests. Please slow down.', 429));
  },
  skip: () => env.NODE_ENV === 'test',
});

// ============================================================================
// ADMIN ORDERS ROUTER (/admin/orders)
// ============================================================================

adminOrdersRouter.use(authenticate);

// Admin order search, filtering, and listing
adminOrdersRouter.get(
  '/',
  requirePermission('order:read'),
  ordersController.listAdminOrders,
);

// Admin stream PDF invoice (fixed sub-path before generic :id)
adminOrdersRouter.get(
  '/:id/invoice',
  requirePermission('order:read'),
  ordersController.getAdminOrderInvoice,
);

// Admin get order timeline (fixed sub-path before generic :id)
adminOrdersRouter.get(
  '/:id/timeline',
  requirePermission('order:read'),
  ordersController.getAdminOrderTimeline,
);

// Admin update order status (State machine transition)
adminOrdersRouter.patch(
  '/:id/status',
  requirePermission('order:update_status'),
  ordersController.updateAdminOrderStatus,
);

// Admin add internal / customer note to order
adminOrdersRouter.post(
  '/:id/notes',
  requirePermission('order:update_status'),
  ordersController.addAdminOrderNote,
);

// Admin get order detail (with timeline, payments, masked costPrice unless order:view_cost)
adminOrdersRouter.get(
  '/:id',
  requirePermission('order:read'),
  ordersController.getAdminOrderById,
);

// Admin order shipment endpoints
adminOrdersRouter.get(
  '/:id/shipments',
  requirePermission('order:read', 'shipping:read'),
  shippingController.getOrderShipment,
);
adminOrdersRouter.post(
  '/:id/shipments',
  requirePermission('order:ship', 'shipping:manage'),
  shippingController.createOrderShipment,
);
adminOrdersRouter.patch(
  '/:id/shipments/status',
  requirePermission('order:ship', 'shipping:manage'),
  shippingController.updateOrderShipmentStatus,
);

// ============================================================================
// ORDERS ROUTER (/orders)
// ============================================================================

// 1. Mount Admin sub-router inside ordersRouter so /orders/admin/orders works as well
ordersRouter.use('/admin/orders', adminOrdersRouter);
ordersRouter.use('/admin', adminOrdersRouter);

// 2. Fixed paths (track, customer root) strictly declared BEFORE :id parameter routes
// Public order tracking (Rate limited)
ordersRouter.post('/track', trackingRateLimiter, ordersController.trackOrder);

// Customer place order from checkout session
ordersRouter.post('/', orderCreateRateLimiter, optionalAuthenticate, ordersController.createOrder);

// Customer list own orders
ordersRouter.get('/', authenticate, ordersController.getMyOrders);

// 3. Customer Parameter Routes (:id)
// Customer cancel own PENDING COD order
ordersRouter.post('/:id/cancel', authenticate, ordersController.cancelMyOrder);

// Customer download own PDF invoice
ordersRouter.get('/:id/invoice', authenticate, ordersController.getMyOrderInvoice);

// Customer get own order detail (IDOR protected)
ordersRouter.get('/:id', authenticate, ordersController.getMyOrderById);
