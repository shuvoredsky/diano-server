import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be alphanumeric with hyphens')
    .max(120)
    .optional(),
  description: z.string().trim().max(1000).optional(),
  image: z.string().url('Image must be a valid URL').optional(),
  parentId: z.string().trim().cuid('Parent ID must be a valid CUID').nullable().optional(),
  isFeatured: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120)
    .optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  image: z.string().url().nullable().optional(),
  parentId: z.string().trim().nullable().optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateCategoryStatusSchema = z.object({
  isActive: z.boolean({ message: 'isActive boolean flag is required' }),
});

export const reorderCategoriesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1, 'Category ID is required'),
        sortOrder: z.coerce.number().int().min(0),
      }),
    )
    .min(1, 'At least one item required for reordering'),
});

export const updateCategoryImageSchema = z.object({
  image: z.string().url('Image must be a valid URL').nullable(),
});

export const deleteCategoryQuerySchema = z.object({
  reassignToId: z.string().trim().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type UpdateCategoryStatusInput = z.infer<typeof updateCategoryStatusSchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
export type UpdateCategoryImageInput = z.infer<typeof updateCategoryImageSchema>;
export type DeleteCategoryQueryInput = z.infer<typeof deleteCategoryQuerySchema>;
