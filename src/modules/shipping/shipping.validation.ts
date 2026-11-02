import { z } from 'zod';

export const shipmentStatusEnum = z.enum([
  'PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED_ATTEMPT',
  'RETURNED_TO_ORIGIN',
  'RETURNING',
  'RETURNED',
]);

export const shippingCalculateQuerySchema = z.object({
  district: z.string().optional(),
  totalWeightKg: z.coerce.number().min(0).optional(),
  subtotal: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid subtotal format').optional(),
  hasFreeShippingProducts: z
    .enum(['true', 'false'])
    .transform(val => val === 'true')
    .optional(),
  deliveryMethodCode: z.string().optional(),
});

export const createShippingZoneSchema = z.object({
  name: z.string().min(2, 'Zone name is required'),
  districts: z.array(z.string().min(1)).min(1, 'At least one district is required'),
  isActive: z.boolean().optional(),
});

export const updateShippingZoneSchema = z.object({
  name: z.string().min(2).optional(),
  districts: z.array(z.string().min(1)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export const createShippingMethodSchema = z.object({
  shippingZoneId: z.string().min(1, 'Shipping zone ID is required'),
  name: z.string().min(2, 'Method name is required'),
  code: z.string().min(2, 'Code is required').toUpperCase(),
  baseCharge: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d{1,2})?$/)]),
  perKgCharge: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  freeShippingThreshold: z
    .union([z.number().min(0), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .nullable()
    .optional(),
  estimatedDays: z.string().min(1, 'Estimated delivery time is required'),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateShippingMethodSchema = z.object({
  shippingZoneId: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  code: z.string().min(2).toUpperCase().optional(),
  baseCharge: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  perKgCharge: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  freeShippingThreshold: z
    .union([z.number().min(0), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .nullable()
    .optional(),
  estimatedDays: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const createOrderShipmentSchema = z.object({
  shippingMethodId: z.string().optional(),
  courierName: z.string().min(1, 'Courier name is required'),
  trackingNumber: z.string().optional(),
  status: shipmentStatusEnum.optional(),
  labelUrl: z.string().url().optional(),
  notes: z.string().max(500).optional(),
});

export const updateShipmentStatusSchema = z.object({
  status: shipmentStatusEnum,
  location: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});
