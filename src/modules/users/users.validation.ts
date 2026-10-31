import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';
import { PASSWORD_REGEX } from '@/utils/password.util';

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'PENDING_VERIFICATION']).optional(),
});

export const createAdminUserSchema = z.object({
  email: z.string().email('Valid email address is required').trim().toLowerCase(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Valid Bangladeshi phone number required')
    .optional(),
  roleSlug: z.string().min(1, 'Role slug is required').trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(PASSWORD_REGEX, 'Password must include uppercase, lowercase, digit, and special character')
    .optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Valid Bangladeshi phone number required')
    .optional(),
  roleSlug: z.string().min(1).trim().optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
export type CreateAdminUserSchemaInput = z.infer<typeof createAdminUserSchema>;
export type UpdateUserSchemaInput = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusSchemaInput = z.infer<typeof updateUserStatusSchema>;
