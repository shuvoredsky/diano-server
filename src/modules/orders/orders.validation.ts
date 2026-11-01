import { z } from 'zod';

export const orderStatusValues = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
  'REFUNDED',
] as const;

export const paymentStatusValues = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export const createOrderSchema = z.object({
  checkoutSessionId: z.string().trim().min(1, 'Checkout session ID is required'),
  guestSecretToken: z.string().trim().optional(),
  customerNotes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').optional(),
});

export const orderFilterSchema = z.object({
  status: z.enum(orderStatusValues).optional(),
  paymentStatus: z.enum(paymentStatusValues).optional(),
  dateFrom: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  dateTo: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(orderStatusValues, {
    message: 'Invalid order status',
  }),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional(),
});

export const addOrderNoteSchema = z.object({
  note: z.string().trim().min(1, 'Note cannot be empty').max(1000, 'Note cannot exceed 1000 characters'),
  isCustomerVisible: z.boolean().default(false),
});

export const trackOrderSchema = z.object({
  orderNumber: z.string().trim().min(5, 'Valid order number is required'),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+?8801|01)[3-9]\d{8}$/, 'Valid Bangladeshi mobile number required (01XXXXXXXXX)'),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500, 'Cancellation reason cannot exceed 500 characters').optional(),
});
