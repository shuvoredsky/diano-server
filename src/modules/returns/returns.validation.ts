import { z } from 'zod';

export const returnStatusEnum = z.enum([
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'ITEM_RECEIVED',
  'RECEIVED',
  'INSPECTED',
  'REFUNDED',
  'REPLACED',
  'CANCELLED',
]);

export const createReturnRequestSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1, 'Order item ID is required'),
        quantity: z.number().int().positive('Quantity must be greater than zero'),
        reasonId: z.string().optional(),
        reasonCode: z.string().optional(),
      }),
    )
    .min(1, 'At least one item must be included in return request'),
  customerNote: z.string().max(500).optional(),
  reasonId: z.string().optional(),
});

export const reviewReturnSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  staffNote: z.string().max(500).optional(),
});

export const receiveReturnSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1, 'Return item ID is required'),
        condition: z.enum(['GOOD', 'DAMAGED']),
        action: z.enum(['REFUND', 'REPLACE', 'REJECT']),
        warehouseId: z.string().optional(),
      }),
    )
    .min(1, 'At least one return item must be inspected'),
  staffNote: z.string().max(500).optional(),
  includeShippingRefund: z.boolean().optional(),
});

export const returnFilterSchema = z.object({
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  status: returnStatusEnum.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
