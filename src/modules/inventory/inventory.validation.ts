import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

export const receiveStockSchema = z
  .object({
    variantId: z.string().trim().min(1, 'Variant ID is required'),
    warehouseId: z.string().trim().min(1, 'Warehouse ID is required'),
    quantity: z.coerce.number().int().positive('Quantity must be an integer greater than zero'),
    reason: z.string().trim().min(3, 'Reason must be at least 3 characters'),
    referenceType: z.string().trim().min(1, 'Reference type is required').default('PURCHASE_ORDER'),
    referenceId: z.string().trim().min(1, 'Reference ID is required'),
    unitCost: z.coerce.number().positive('Unit cost must be positive').optional(),
  })
  .strict();

export const adjustStockSchema = z
  .object({
    variantId: z.string().trim().min(1, 'Variant ID is required'),
    warehouseId: z.string().trim().min(1, 'Warehouse ID is required'),
    quantity: z
      .coerce
      .number()
      .int()
      .refine(val => val !== 0, 'Adjustment quantity cannot be zero'),
    reason: z.string().trim().min(3, 'Adjustment reason is required (min 3 characters)'),
    referenceType: z.string().trim().optional().default('MANUAL'),
    referenceId: z.string().trim().optional(),
  })
  .strict();

export const damageStockSchema = z
  .object({
    variantId: z.string().trim().min(1, 'Variant ID is required'),
    warehouseId: z.string().trim().min(1, 'Warehouse ID is required'),
    quantity: z.coerce.number().int().positive('Damaged quantity must be greater than zero'),
    reason: z.string().trim().min(3, 'Damage reason is required (min 3 characters)'),
    referenceType: z.string().trim().optional().default('MANUAL'),
    referenceId: z.string().trim().optional(),
  })
  .strict();

export const transferStockSchema = z
  .object({
    variantId: z.string().trim().min(1, 'Variant ID is required'),
    sourceWarehouseId: z.string().trim().min(1, 'Source warehouse ID is required'),
    targetWarehouseId: z.string().trim().min(1, 'Target warehouse ID is required'),
    quantity: z.coerce.number().int().positive('Transfer quantity must be greater than zero'),
    reason: z.string().trim().min(3, 'Transfer reason is required (min 3 characters)'),
    referenceType: z.string().trim().optional().default('TRANSFER'),
    referenceId: z.string().trim().optional(),
  })
  .strict()
  .refine(
    data => data.sourceWarehouseId !== data.targetWarehouseId,
    {
      message: 'Source and target warehouse must be distinct',
      path: ['targetWarehouseId'],
    },
  );

export const inventoryFilterQuerySchema = paginationQuerySchema.extend({
  warehouseId: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  search: z.string().trim().optional(),
  lowStockOnly: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
  outOfStockOnly: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
});

export const stockMovementQuerySchema = paginationQuerySchema.extend({
  variantId: z.string().trim().optional(),
  warehouseId: z.string().trim().optional(),
  type: z
    .enum([
      'PURCHASE_RECEIPT',
      'ORDER_RESERVATION',
      'ORDER_RELEASE',
      'ORDER_FULFILLMENT',
      'ORDER_CANCELLATION',
      'RETURN_RESTOCK',
      'DAMAGE_ADJUSTMENT',
      'AUDIT_ADJUSTMENT',
      'MANUAL_ADJUSTMENT',
      'TRANSFER_IN',
      'TRANSFER_OUT',
    ])
    .optional(),
  actorId: z.string().trim().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
