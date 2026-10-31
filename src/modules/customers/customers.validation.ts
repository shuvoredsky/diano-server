import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'PENDING_VERIFICATION']).optional(),
});

export const updateCustomerProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Valid Bangladeshi phone number required')
    .optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dateOfBirth: z.coerce.date().optional(),
});

export const createAddressSchema = z.object({
  type: z.enum(['SHIPPING', 'BILLING']).default('SHIPPING'),
  isDefault: z.boolean().default(false),
  fullName: z.string().min(2, 'Full name is required').max(100).trim(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Valid Bangladeshi phone number required'),
  alternativePhone: z
    .string()
    .trim()
    .regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Valid Bangladeshi phone number required')
    .optional(),
  addressLine: z.string().min(5, 'Address line must be at least 5 characters').max(255).trim(),
  district: z.string().min(2, 'District is required').max(50).trim(),
  city: z.string().min(2, 'City is required').max(50).trim(),
  area: z.string().max(50).trim().optional(),
  postalCode: z.string().max(20).trim().optional(),
  landmark: z.string().max(100).trim().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

export const updateConsentsSchema = z.object({
  consents: z.array(
    z.object({
      channel: z.enum(['SMS', 'EMAIL', 'WHATSAPP']),
      purpose: z.enum(['MARKETING', 'RECOVERY', 'ANALYTICS']),
      isGranted: z.boolean(),
    }),
  ),
});

export const createCustomerNoteSchema = z.object({
  note: z.string().min(1, 'Note content is required').max(1000).trim(),
});

export const updateCustomerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export type ListCustomersQueryInput = z.infer<typeof listCustomersQuerySchema>;
export type UpdateCustomerProfileSchemaInput = z.infer<typeof updateCustomerProfileSchema>;
export type CreateAddressSchemaInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressSchemaInput = z.infer<typeof updateAddressSchema>;
export type UpdateConsentsSchemaInput = z.infer<typeof updateConsentsSchema>;
export type CreateCustomerNoteSchemaInput = z.infer<typeof createCustomerNoteSchema>;
export type UpdateCustomerStatusSchemaInput = z.infer<typeof updateCustomerStatusSchema>;
