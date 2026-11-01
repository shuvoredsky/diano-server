import type { BannerPlacement } from '@prisma/client';

export interface CreateBannerInput {
  placement: BannerPlacement;
  title: string;
  subtitle?: string | null;
  desktopImage: string;
  mobileImage?: string | null;
  altText?: string | null;
  linkUrl?: string | null;
  ctaText?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export type UpdateBannerInput = Partial<CreateBannerInput>;

export interface BannerReorderItem {
  id: string;
  sortOrder: number;
}

export interface BannerFilterOptions {
  placement?: BannerPlacement;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
