import type { PageType, PageStatus, Page, PageRevision } from '@prisma/client';

export type BlockType =
  | 'heading'
  | 'richText'
  | 'image'
  | 'list'
  | 'faq'
  | 'cta'
  | 'banner-ref';

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface RichTextBlock {
  type: 'richText';
  html: string;
}

export interface ImageBlock {
  type: 'image';
  url: string;
  altText?: string;
  caption?: string;
}

export interface ListBlock {
  type: 'list';
  items: string[];
  ordered?: boolean;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqBlock {
  type: 'faq';
  items: FaqItem[];
}

export interface CtaBlock {
  type: 'cta';
  title: string;
  subtitle?: string;
  buttonText: string;
  buttonUrl: string;
}

export interface BannerRefBlock {
  type: 'banner-ref';
  bannerId: string;
}

export type PageBlock =
  | HeadingBlock
  | RichTextBlock
  | ImageBlock
  | ListBlock
  | FaqBlock
  | CtaBlock
  | BannerRefBlock;

export interface CreatePageInput {
  slug: string;
  type?: PageType;
  title: string;
  content?: PageBlock[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  status?: PageStatus;
}

export interface UpdatePageInput {
  title?: string;
  type?: PageType;
  content?: PageBlock[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  status?: PageStatus;
}

export interface PageFilterOptions {
  type?: PageType;
  status?: PageStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PageNavSummary {
  slug: string;
  title: string;
  type: PageType;
}

export { Page, PageRevision };
