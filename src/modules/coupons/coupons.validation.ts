import { z } from 'zod';

export const couponTypeEnum = z.enum(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING']);

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(3, 'Coupon code must be at least 3 characters')
    .max(30, 'Coupon code must not exceed 30 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code can only contain letters, numbers, hyphens, and underscores'),
  type: couponTypeEnum,
  value: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]),
  minPurchase: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  maxDiscount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).nullable().optional(),
  startsAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().optional(),
  firstOrderOnly: z.boolean().optional(),
  allowOnSale: z.boolean().optional(),
  scopes: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
}).refine(data => data.startsAt < data.expiresAt, {
  message: 'expiresAt must be after startsAt',
  path: ['expiresAt'],
});

export const updateCouponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  type: couponTypeEnum.optional(),
  value: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  minPurchase: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  maxDiscount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).nullable().optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().optional(),
  firstOrderOnly: z.boolean().optional(),
  allowOnSale: z.boolean().optional(),
  scopes: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const couponFilterSchema = z.object({
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
  type: couponTypeEnum.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const applyCouponSchema = z.object({
  code: z.string().min(2, 'Coupon code is required').trim(),
});

export const createFlashSaleSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  description: z.string().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  isActive: z.boolean().optional(),
  items: z.array(
    z.object({
      variantId: z.string().min(1, 'Variant ID is required'),
      discountPrice: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]),
      stockLimit: z.number().int().positive(),
    }),
  ).min(1, 'At least one variant must be in flash sale'),
}).refine(data => data.startsAt < data.endsAt, {
  message: 'endsAt must be after startsAt',
  path: ['endsAt'],
});
