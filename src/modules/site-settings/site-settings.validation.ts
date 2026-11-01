import { z } from 'zod';

export const settingGroupParamSchema = z.object({
  group: z.enum(['store_profile', 'invoice', 'seo_defaults', 'contact'], {
    message: 'Invalid setting group. Allowed: store_profile, invoice, seo_defaults, contact',
  }),
});

const urlOrRelativePath = z
  .string()
  .refine(
    val => {
      if (!val) return true;
      if (val.startsWith('/') && !val.startsWith('//')) return true;
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid HTTP/HTTPS URL or relative path' },
  )
  .optional();

export const storeProfileSchema = z.object({
  storeName: z.string().min(2, 'Store name must be at least 2 characters').max(100),
  tagline: z.string().max(200).optional(),
  logo: urlOrRelativePath,
  favicon: urlOrRelativePath,
  phone: z.string().min(6, 'Valid phone number required').max(20),
  email: z.string().email('Valid email address required'),
  address: z.string().min(5, 'Address must be at least 5 characters').max(300),
  socialLinks: z
    .object({
      facebook: z.string().url().optional().or(z.literal('')),
      instagram: z.string().url().optional().or(z.literal('')),
      youtube: z.string().url().optional().or(z.literal('')),
      twitter: z.string().url().optional().or(z.literal('')),
      tiktok: z.string().url().optional().or(z.literal('')),
    })
    .optional(),
  businessRegistration: z.string().max(100).optional(),
  bin: z.string().max(50).optional(),
  vat: z.string().max(50).optional(),
});

export const invoiceSettingSchema = z.object({
  prefix: z.string().min(1).max(10).regex(/^[A-Z0-9_-]+$/, 'Prefix must be alphanumeric uppercase'),
  footerNote: z.string().max(500).optional(),
  termsNote: z.string().max(1000).optional(),
  showLogo: z.boolean().default(true),
  signatureText: z.string().max(100).optional(),
});

export const seoDefaultsSchema = z.object({
  titleTemplate: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  ogImage: urlOrRelativePath,
});

export const contactSettingSchema = z.object({
  supportPhone: z.string().min(6).max(20),
  supportEmail: z.string().email('Valid support email required'),
  address: z.string().min(5).max(300),
  supportHours: z.string().min(3).max(150),
});

export const getGroupSchema = (group: string) => {
  switch (group) {
    case 'store_profile':
      return storeProfileSchema;
    case 'invoice':
      return invoiceSettingSchema;
    case 'seo_defaults':
      return seoDefaultsSchema;
    case 'contact':
      return contactSettingSchema;
    default:
      throw new Error(`Unsupported setting group: ${group}`);
  }
};
