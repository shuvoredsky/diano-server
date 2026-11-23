import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

export const createSectionSchema = z
  .object({
    name: z.string().trim().min(2, 'Section name must be at least 2 characters').max(100),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be alphanumeric with hyphens')
      .max(120)
      .optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    imageUrl: z.string().trim().url('Invalid image URL').nullable().optional(),
    parentId: z.string().trim().nullable().optional(),
    displayOrder: z.coerce.number().int().min(0).optional().default(0),
    isActive: z.boolean().optional().default(true),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine(
    data => {
      if (data.startsAt && data.endsAt) {
        return new Date(data.startsAt) < new Date(data.endsAt);
      }
      return true;
    },
    {
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    },
  );

export const updateSectionSchema = z
  .object({
    name: z.string().trim().min(2, 'Section name must be at least 2 characters').max(100).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be alphanumeric with hyphens')
      .max(120)
      .optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    imageUrl: z.string().trim().url('Invalid image URL').nullable().optional(),
    parentId: z.string().trim().nullable().optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine(
    data => {
      if (data.startsAt && data.endsAt) {
        return new Date(data.startsAt) < new Date(data.endsAt);
      }
      return true;
    },
    {
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    },
  );

export const reorderSectionsSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().trim().min(1, 'Section ID is required'),
          displayOrder: z.coerce.number().int().min(0),
          parentId: z.string().trim().nullable().optional(),
        }),
      )
      .min(1, 'At least one item is required for reorder'),
  })
  .strict();

export const assignSectionProductsSchema = z
  .object({
    productIds: z.array(z.string().trim().min(1)).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().trim().min(1, 'Product ID is required'),
          sortOrder: z.coerce.number().int().min(0).optional(),
        }),
      )
      .optional(),
  })
  .strict()
  .refine(
    data =>
      (data.productIds && data.productIds.length > 0) ||
      (data.items && data.items.length > 0),
    {
      message: 'Must provide either productIds or items array',
    },
  );

export const reorderSectionProductsSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().trim().min(1, 'Product ID is required'),
          sortOrder: z.coerce.number().int().min(0),
        }),
      )
      .min(1, 'At least one item is required'),
  })
  .strict();

export const sectionProductsQuerySchema = paginationQuerySchema;

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;
export type AssignSectionProductsInput = z.infer<typeof assignSectionProductsSchema>;
export type ReorderSectionProductsInput = z.infer<typeof reorderSectionProductsSchema>;

