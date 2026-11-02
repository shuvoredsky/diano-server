import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { optionalAuthenticate, authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { paymentsController } from './payments.controller';

const paymentInitiateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many payment attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const gatewayCallbackLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests to payment gateway endpoints.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware specifically for SSLCOMMERZ form urlencoded POST callbacks
const urlencodedParser = express.urlencoded({ extended: true, limit: '1mb' });

export const paymentsRouter = Router();

// ==============================================================================
// PUBLIC & CUSTOMER PAYMENT ROUTES (Fixed paths MUST come before :orderId params)
// ==============================================================================

// Customer: Initiate payment session
paymentsRouter.post(
  '/initiate',
  paymentInitiateLimiter,
  optionalAuthenticate,
  paymentsController.initiatePayment,
);

// SSLCOMMERZ Gateway Callbacks (public, form urlencoded)
paymentsRouter.post(
  '/sslcommerz/success',
  gatewayCallbackLimiter,
  urlencodedParser,
  paymentsController.handleSslSuccess,
);

paymentsRouter.post(
  '/sslcommerz/fail',
  gatewayCallbackLimiter,
  urlencodedParser,
  paymentsController.handleSslFail,
);

paymentsRouter.post(
  '/sslcommerz/cancel',
  gatewayCallbackLimiter,
  urlencodedParser,
  paymentsController.handleSslCancel,
);

paymentsRouter.post(
  '/sslcommerz/ipn',
  gatewayCallbackLimiter,
  urlencodedParser,
  paymentsController.handleSslIpn,
);

// Customer: Check payment status for order (Param route placed AFTER fixed paths)
paymentsRouter.get(
  '/:orderId/status',
  optionalAuthenticate,
  paymentsController.getPaymentStatus,
);

// ==============================================================================
// ADMIN PAYMENT ROUTES
// ==============================================================================

export const adminPaymentsRouter = Router();

adminPaymentsRouter.use(authenticate);

// Admin: List all payments with filters
adminPaymentsRouter.get(
  '/',
  requirePermission('payment:read'),
  paymentsController.listAdminPayments,
);

// Admin: Mark COD payment collected
adminPaymentsRouter.post(
  '/:id/mark-cod-collected',
  requirePermission('payment:manage'),
  paymentsController.markCodCollected,
);

// Admin: Refund payment
adminPaymentsRouter.post(
  '/:id/refund',
  requirePermission('payment:refund'),
  paymentsController.refundPayment,
);

// Admin: Get payment by ID with timeline (Placed after sub-actions)
adminPaymentsRouter.get(
  '/:id',
  requirePermission('payment:read'),
  paymentsController.getAdminPaymentById,
);
