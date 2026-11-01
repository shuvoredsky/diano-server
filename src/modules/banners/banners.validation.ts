import { z } from 'zod';
import { BannerPlacement } from '@prisma/client';

export const safeLinkUrlSchema = z
  .string()
  .refine(
    val => {
      if (!val || val.trim() === '') return true;
      const trimmed = val.trim();
      const lower = trimmed.toLowerCase();

      // Block malicious and javascript/data URI execution vectors
      if (
        lower.startsWith('javascript:') ||
        lower.startsWith('data:') ||
        lower.startsWith('vbscript:') ||
        lower.startsWith('file:')
      ) {
        return false;
      }

      // Allow relative paths (e.g. /products/summer-sale)
      if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
        return true;
      }

      // Allow strictly HTTPS (or HTTP in dev)
      try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        return false;
      }
    },
    { message: 'Link URL must be a valid relative path (e.g. /shop) or HTTPS URL. javascript: and data: are blocked.' },
  )
  .nullable()
  .optional();

export const bannerBaseSchema = z.object({
  placement: z.nativeEnum(BannerPlacement, {
    message: 'Invalid placement. Allowed: HOME_HERO, HOME_SECONDARY, CATEGORY_TOP, ANNOUNCEMENT_BAR, POPUP',
  }),
  title: z.string().min(2, 'Title must be at least 2 characters').max(150),
  subtitle: z.string().max(250).nullable().optional(),
  desktopImage: z.string().min(1, 'Desktop image is required'),
  mobileImage: z.string().nullable().optional(),
  altText: z.string().max(150).nullable().optional(),
  linkUrl: safeLinkUrlSchema,
  ctaText: z.string().max(50).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const createBannerSchema = bannerBaseSchema.refine(
  data => {
    if (data.startsAt && data.endsAt) {
      return data.endsAt > data.startsAt;
    }
    return true;
  },
  {
    message: 'End date (endsAt) must be strictly after start date (startsAt)',
    path: ['endsAt'],
  },
);

export const updateBannerSchema = bannerBaseSchema
  .partial()
  .refine(
    data => {
      if (data.startsAt && data.endsAt) {
        return data.endsAt > data.startsAt;
      }
      return true;
    },
    {
      message: 'End date (endsAt) must be strictly after start date (startsAt)',
      path: ['endsAt'],
    },
  );

export const bannerReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1, 'At least one banner must be specified for reordering'),
});

export const publicBannerQuerySchema = z.object({
  placement: z.nativeEnum(BannerPlacement, {
    message: 'Valid placement parameter is required',
  }),
});

export const bannerFilterSchema = z.object({
  placement: z.nativeEnum(BannerPlacement).optional(),
  isActive: z
    .string()
    .transform(val => (val === 'true' ? true : val === 'false' ? false : undefined))
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
