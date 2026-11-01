import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name must be at least 2 characters').max(150),
  code: z.string().trim().min(2).max(50).optional(),
  contactPerson: z.string().trim().max(100).optional(),
  email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().trim().min(6, 'Phone number must be at least 6 digits').max(30).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const supplierFilterQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform(val => val === 'true')
    .optional(),
});
