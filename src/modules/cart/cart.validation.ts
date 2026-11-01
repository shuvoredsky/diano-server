import { z } from 'zod';

export const addCartItemSchema = z
  .object({
    variantId: z.string().trim().min(1, 'Variant ID is required'),
    quantity: z.number().int().positive('Quantity must be at least 1'),
  })
  .strict();

export const updateCartItemSchema = z
  .object({
    quantity: z.number().int().nonnegative('Quantity cannot be negative'),
  })
  .strict();

export const mergeCartSchema = z
  .object({
    guestToken: z.string().trim().optional(),
  })
  .strict();
