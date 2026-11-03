import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  guestToken: z.string().optional(),
});

export const adminRefundSchema = z.object({
  amount: z.number().positive('Refund amount must be greater than zero'),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
  idempotencyKey: z.string().optional(),
});

export const markCodCollectedSchema = z.object({
  note: z.string().optional(),
});

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  provider: z.enum(['SSLCOMMERZ', 'COD']).optional(),
  status: z
    .enum([
      'INITIATED',
      'PENDING',
      'PROCESSING',
      'PAID',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'REFUND_PENDING',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ])
    .optional(),
  orderId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
