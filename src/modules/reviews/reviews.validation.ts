import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional(),
  comment: z.string().trim().min(3, 'Review comment must be at least 3 characters').max(2000),
  images: z
    .union([
      z.array(z.string().url()).max(5),
      z.string().url().transform(val => [val]),
    ])
    .optional(),
});

export const publicProductReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export const adminListReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  productId: z.string().trim().min(1).optional(),
  productSlug: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const updateReviewStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  reason: z.string().trim().max(500).optional(),
});

export const reviewIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const productSlugParamSchema = z.object({
  slug: z.string().trim().min(1),
});

