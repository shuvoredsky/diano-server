import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

export const createPoItemSchema = z.object({
  variantId: z.string().trim().min(1, 'Variant ID is required'),
  orderedQuantity: z.number().int().positive('Ordered quantity must be greater than zero'),
  unitCost: z.number().nonnegative('Unit cost cannot be negative'),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().trim().min(1, 'Supplier ID is required'),
  warehouseId: z.string().trim().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(createPoItemSchema).min(1, 'At least one line item is required'),
});

export const updatePoStatusSchema = z.object({
  status: z.enum(['ORDERED', 'CANCELLED']),
});

export const receivePoItemSchema = z.object({
  variantId: z.string().trim().min(1, 'Variant ID is required'),
  quantity: z.number().int().positive('Quantity must be greater than zero'),
});

export const receivePurchaseOrderSchema = z.object({
  items: z.array(receivePoItemSchema).min(1, 'At least one receiving item is required'),
  notes: z.string().trim().max(500).optional(),
});

export const purchaseOrderFilterQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']).optional(),
  supplierId: z.string().trim().optional(),
  warehouseId: z.string().trim().optional(),
  variantId: z.string().trim().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
