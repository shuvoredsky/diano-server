import { z } from 'zod';

export const refundStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export const executeRefundSchema = z.object({
  paymentId: z.string().optional(),
  orderId: z.string().optional(),
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  reason: z.string().min(3, 'Refund reason is required').max(500),
  returnRequestId: z.string().optional(),
  refundShipping: z.boolean().optional(),
  manualReference: z.string().max(100).optional(),
});

export const refundFilterSchema = z.object({
  orderId: z.string().optional(),
  paymentId: z.string().optional(),
  status: refundStatusEnum.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
