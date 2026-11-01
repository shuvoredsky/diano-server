import { z } from 'zod';

export const addWishlistItemSchema = z
  .object({
    variantId: z.string().trim().min(1, 'Variant ID is required'),
    productId: z.string().trim().optional(),
  })
  .strict();
