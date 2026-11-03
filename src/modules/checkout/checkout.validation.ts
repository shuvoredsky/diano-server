import { z } from 'zod';

const bdPhoneRegex = /^(?:\+8801|8801|01)[3-9]\d{8}$/;

export const customerInfoSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    phone: z
      .string()
      .trim()
      .regex(bdPhoneRegex, 'Please provide a valid Bangladeshi phone number (e.g. 017xxxxxxxx)'),
    email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
    consentForRecovery: z.boolean().optional().default(false),
  })
  .strict();

export const shippingInfoSchema = z
  .object({
    address: z.string().trim().min(5, 'Street address must be at least 5 characters').max(255),
    district: z.string().trim().min(2, 'District is required').max(100),
    area: z.string().trim().min(2, 'Area / Thana is required').max(100),
  })
  .strict();

export const deliveryMethodSchema = z
  .object({
    code: z.string().trim().min(2, 'Delivery method code is required'),
  })
  .strict();

export const paymentMethodSchema = z
  .object({
    provider: z.enum(['COD', 'SSLCOMMERZ'] as const, {
      message: 'Invalid payment provider. Allowed: COD, SSLCOMMERZ',
    }),
  })
  .strict();

export const checkoutEventSchema = z
  .object({
    type: z.enum([
      'checkout_started',
      'customer_info_entered',
      'shipping_info_entered',
      'payment_method_selected',
      'checkout_step_completed',
      'checkout_abandoned',
      'order_placed',
      'CHECKOUT_STARTED',
      'CUSTOMER_INFO_ENTERED',
      'SHIPPING_INFO_ENTERED',
      'PAYMENT_METHOD_SELECTED',
      'CHECKOUT_STEP_COMPLETED',
      'CHECKOUT_ABANDONED',
      'ORDER_PLACED',
    ] as const),
    metadata: z
      .object({
        step: z.string().optional(),
        method: z.string().optional(),
        deviceCategory: z.enum(['DESKTOP', 'MOBILE', 'TABLET', 'OTHER'] as const).optional(),
      })
      .strict()
      .optional()
      .default({}),
  })
  .strict();
