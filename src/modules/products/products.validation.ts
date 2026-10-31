import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

export const variantInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Variant name is required').max(100),
    sku: z
      .string()
      .trim()
      .min(2, 'SKU must be at least 2 characters')
      .max(64)
      .regex(/^[A-Za-z0-9-_]+$/, 'SKU must contain alphanumeric characters, hyphens or underscores'),
    barcode: z.string().trim().max(64).nullable().optional(),
    price: z.coerce.number().positive('Price must be greater than 0'),
    compareAtPrice: z.coerce.number().positive('Compare at price must be positive').nullable().optional(),
    costPrice: z.coerce.number().min(0, 'Cost price cannot be negative').nullable().optional(),
    attributes: z.record(z.string(), z.unknown()).optional().default({}),
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    data => {
      if (data.compareAtPrice !== undefined && data.compareAtPrice !== null) {
        return data.compareAtPrice >= data.price;
      }
      return true;
    },
    {
      message: 'compareAtPrice must be greater than or equal to price',
      path: ['compareAtPrice'],
    },
  );

export const updateVariantSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    sku: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[A-Za-z0-9-_]+$/)
      .optional(),
    barcode: z.string().trim().max(64).nullable().optional(),
    price: z.coerce.number().positive().optional(),
    compareAtPrice: z.coerce.number().positive().nullable().optional(),
    costPrice: z.coerce.number().min(0).nullable().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    data => {
      if (
        data.price !== undefined &&
        data.compareAtPrice !== undefined &&
        data.compareAtPrice !== null
      ) {
        return data.compareAtPrice >= data.price;
      }
      return true;
    },
    {
      message: 'compareAtPrice must be greater than or equal to price',
      path: ['compareAtPrice'],
    },
  );

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Product name must be at least 2 characters').max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be alphanumeric with hyphens')
    .max(220)
    .optional(),
  description: z.string().trim().min(10, 'Description must be at least 10 characters'),
  shortDescription: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().trim().min(1, 'Category ID is required'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional().default('DRAFT'),
  isFeatured: z.boolean().optional().default(false),
  metaTitle: z.string().trim().max(100).nullable().optional(),
  metaDescription: z.string().trim().max(300).nullable().optional(),
  metaKeywords: z.string().trim().max(200).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  relatedProductIds: z.array(z.string().trim()).optional().default([]),
  variants: z.array(variantInputSchema).min(1, 'At least one product variant is required'),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(220)
    .optional(),
  description: z.string().trim().min(10).optional(),
  shortDescription: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().trim().min(1).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  isFeatured: z.boolean().optional(),
  metaTitle: z.string().trim().max(100).nullable().optional(),
  metaDescription: z.string().trim().max(300).nullable().optional(),
  metaKeywords: z.string().trim().max(200).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  relatedProductIds: z.array(z.string().trim()).optional(),
});

export const updateProductStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'], {
    message: 'Status must be DRAFT, ACTIVE, or ARCHIVED',
  }),
});

export const updateProductFeaturedSchema = z.object({
  isFeatured: z.boolean({ message: 'isFeatured boolean flag is required' }),
});

export const productQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100, 'Search query cannot exceed 100 characters').optional(),
  categoryId: z.string().trim().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  tags: z
    .union([z.string().transform(val => [val]), z.array(z.string())])
    .optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  isFeatured: z
    .enum(['true', 'false'])
    .transform(val => val === 'true')
    .optional(),
  inStock: z
    .enum(['true', 'false'])
    .transform(val => val === 'true')
    .optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  sortBy: z
    .enum(['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'popular'])
    .optional()
    .default('newest'),
});

export const updateProductImageSchema = z.object({
  altText: z.string().trim().max(200).optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const reorderProductImagesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1, 'Image ID is required'),
        sortOrder: z.coerce.number().int().min(0),
      }),
    )
    .min(1, 'At least one item required for reordering'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateProductStatusInput = z.infer<typeof updateProductStatusSchema>;
export type UpdateProductFeaturedInput = z.infer<typeof updateProductFeaturedSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type UpdateProductImageInput = z.infer<typeof updateProductImageSchema>;
export type ReorderProductImagesInput = z.infer<typeof reorderProductImagesSchema>;
