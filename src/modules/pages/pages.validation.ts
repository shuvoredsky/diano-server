import { z } from 'zod';
import { PageType, PageStatus } from '@prisma/client';

export const SYSTEM_PAGE_SLUGS = [
  'privacy-policy',
  'terms',
  'return-policy',
  'shipping-policy',
] as const;

export const headingBlockSchema = z.object({
  type: z.literal('heading'),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  text: z.string().min(1).max(300),
});

export const richTextBlockSchema = z.object({
  type: z.literal('richText'),
  html: z.string().min(1).max(50000),
});

export const imageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.string().min(1, 'Image URL is required'),
  altText: z.string().max(200).optional(),
  caption: z.string().max(300).optional(),
});

export const listBlockSchema = z.object({
  type: z.literal('list'),
  items: z.array(z.string().min(1).max(500)).min(1).max(100),
  ordered: z.boolean().default(false),
});

export const faqBlockSchema = z.object({
  type: z.literal('faq'),
  items: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        answer: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(50),
});

export const ctaBlockSchema = z.object({
  type: z.literal('cta'),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  buttonText: z.string().min(1).max(50),
  buttonUrl: z
    .string()
    .min(1, 'Valid button URL required')
    .refine(
      val => {
        const lower = val.trim().toLowerCase();
        if (lower.startsWith('javascript:') || lower.startsWith('data:')) return false;
        return true;
      },
      { message: 'Malicious schemes like javascript: or data: are blocked' },
    ),
});

export const bannerRefBlockSchema = z.object({
  type: z.literal('banner-ref'),
  bannerId: z.string().min(1, 'Banner reference ID required'),
});

export const pageBlockSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  richTextBlockSchema,
  imageBlockSchema,
  listBlockSchema,
  faqBlockSchema,
  ctaBlockSchema,
  bannerRefBlockSchema,
]);

export const pageContentBlocksSchema = z
  .array(pageBlockSchema)
  .max(100, 'Page cannot exceed 100 blocks');

export const createPageSchema = z.object({
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric and kebab-case'),
  type: z.nativeEnum(PageType).default(PageType.CUSTOM),
  title: z.string().min(2, 'Title must be at least 2 characters').max(200),
  content: pageContentBlocksSchema.default([]),
  metaTitle: z.string().max(150).nullable().optional(),
  metaDescription: z.string().max(300).nullable().optional(),
  ogImage: z.string().nullable().optional(),
  status: z.nativeEnum(PageStatus).default(PageStatus.DRAFT),
});

export const updatePageSchema = createPageSchema
  .omit({ slug: true })
  .partial();

export const pageFilterSchema = z.object({
  type: z.nativeEnum(PageType).optional(),
  status: z.nativeEnum(PageStatus).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
