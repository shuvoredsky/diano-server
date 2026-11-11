import { z } from 'zod';

export const analyticsPeriodEnum = z.enum([
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_year',
  'last_year',
  'custom',
]);

export const analyticsQuerySchema = z
  .object({
    period: analyticsPeriodEnum.default('this_month'),
    from: z.string().optional(),
    to: z.string().optional(),
    compare: z
      .preprocess(val => val === 'true' || val === true || val === undefined, z.boolean())
      .default(true),
  })
  .refine(
    data => {
      if (data.period === 'custom') {
        return !!data.from && !!data.to;
      }
      return true;
    },
    {
      message: "Custom period requires both 'from' and 'to' query parameters",
      path: ['from'],
    },
  );

export const chartTypeEnum = z.enum([
  'sales-trend',
  'orders-trend',
  'profit-trend',
  'payment-method-pie',
  'order-status-pie',
  'top-categories-bar',
  'hourly-heatmap',
  'district-choropleth-data',
  'shipment-status',
  'stock-by-subcategory',
]);

export const chartQuerySchema = analyticsQuerySchema.extend({
  type: chartTypeEnum.optional(),
});
