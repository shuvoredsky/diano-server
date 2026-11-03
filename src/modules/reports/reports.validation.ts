import { z } from 'zod';
import { analyticsPeriodEnum } from '@/modules/analytics/analytics.validation';

export const reportFormatEnum = z.enum(['csv', 'xlsx', 'pdf']);
export const spreadsheetFormatEnum = z.enum(['csv', 'xlsx']);

export const ordersReportSchema = z.object({
  format: reportFormatEnum.default('csv'),
  period: analyticsPeriodEnum.default('this_month'),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z
    .enum([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'PACKED',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'RETURNED',
      'REFUNDED',
    ])
    .optional(),
  paymentMethod: z.enum(['COD', 'SSLCOMMERZ']).optional(),
});

export const salesReportSchema = z.object({
  format: spreadsheetFormatEnum.default('csv'),
  period: analyticsPeriodEnum.default('this_month'),
  from: z.string().optional(),
  to: z.string().optional(),
  group_by: z.enum(['day', 'week', 'month']).default('day'),
});

export const inventoryReportSchema = z.object({
  format: spreadsheetFormatEnum.default('csv'),
  warehouseId: z.string().optional(),
  categoryId: z.string().optional(),
  lowStockOnly: z
    .preprocess(val => val === 'true' || val === true, z.boolean())
    .optional()
    .default(false),
});

export const customersReportSchema = z.object({
  format: spreadsheetFormatEnum.default('csv'),
  minOrders: z.coerce.number().int().nonnegative().optional(),
  district: z.string().optional(),
});

export const financialReportSchema = z.object({
  format: reportFormatEnum.default('csv'),
  period: analyticsPeriodEnum.default('this_month'),
  from: z.string().optional(),
  to: z.string().optional(),
});
