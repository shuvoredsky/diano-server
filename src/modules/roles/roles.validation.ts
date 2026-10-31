import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50).trim(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and hyphens'),
  description: z.string().max(255).trim().optional(),
  permissionSlugs: z.array(z.string().trim()).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50).trim().optional(),
  description: z.string().max(255).trim().optional(),
});

export const assignPermissionsSchema = z.object({
  permissionSlugs: z.array(z.string().trim()),
});

export type CreateRoleSchemaInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleSchemaInput = z.infer<typeof updateRoleSchema>;
export type AssignPermissionsSchemaInput = z.infer<typeof assignPermissionsSchema>;
