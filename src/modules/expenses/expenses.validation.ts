import { z } from 'zod';

export const expenseCategoryEnum = z.enum([
  'RENT',
  'SALARIES',
  'UTILITIES',
  'MARKETING',
  'PACKAGING',
  'LOGISTICS',
  'OFFICE_SUPPLIES',
  'SOFTWARE_SUBSCRIPTION',
  'MAINTENANCE',
  'OTHER',
]);

export const createExpenseSchema = z.object({
  category: expenseCategoryEnum,
  amount: z.union([
    z.number().positive('Amount must be greater than zero'),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid monetary decimal'),
  ]),
  date: z.coerce.date(),
  note: z.string().max(500, 'Note must not exceed 500 characters').optional(),
});

export const updateExpenseSchema = z.object({
  category: expenseCategoryEnum.optional(),
  amount: z
    .union([
      z.number().positive('Amount must be greater than zero'),
      z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid monetary decimal'),
    ])
    .optional(),
  date: z.coerce.date().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const expenseFilterSchema = z.object({
  category: expenseCategoryEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
