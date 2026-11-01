import { prisma } from '@/config/database';
import type { Banner, BannerPlacement } from '@prisma/client';
import type {
  CreateBannerInput,
  UpdateBannerInput,
  BannerFilterOptions,
  BannerReorderItem,
} from './banners.types';

export interface IBannersRepository {
  create(data: CreateBannerInput): Promise<Banner>;
  findById(id: string): Promise<Banner | null>;
  update(id: string, data: UpdateBannerInput): Promise<Banner>;
  delete(id: string): Promise<Banner>;
  countActiveByPlacement(placement: BannerPlacement, excludeId?: string): Promise<number>;
  findActiveByPlacement(placement: BannerPlacement, atDate?: Date): Promise<Banner[]>;
  findAll(filter: BannerFilterOptions): Promise<{ items: Banner[]; total: number }>;
  reorder(items: BannerReorderItem[]): Promise<void>;
}

export class PrismaBannersRepository implements IBannersRepository {
  async create(data: CreateBannerInput): Promise<Banner> {
    return prisma.banner.create({
      data: {
        placement: data.placement,
        title: data.title,
        subtitle: data.subtitle,
        desktopImage: data.desktopImage,
        mobileImage: data.mobileImage,
        altText: data.altText,
        linkUrl: data.linkUrl,
        ctaText: data.ctaText,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async findById(id: string): Promise<Banner | null> {
    return prisma.banner.findUnique({
      where: { id },
    });
  }

  async update(id: string, data: UpdateBannerInput): Promise<Banner> {
    return prisma.banner.update({
      where: { id },
      data: {
        ...(data.placement !== undefined && { placement: data.placement }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
        ...(data.desktopImage !== undefined && { desktopImage: data.desktopImage }),
        ...(data.mobileImage !== undefined && { mobileImage: data.mobileImage }),
        ...(data.altText !== undefined && { altText: data.altText }),
        ...(data.linkUrl !== undefined && { linkUrl: data.linkUrl }),
        ...(data.ctaText !== undefined && { ctaText: data.ctaText }),
        ...(data.startsAt !== undefined && {
          startsAt: data.startsAt ? new Date(data.startsAt) : null,
        }),
        ...(data.endsAt !== undefined && {
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    });
  }

  async delete(id: string): Promise<Banner> {
    return prisma.banner.delete({
      where: { id },
    });
  }

  async countActiveByPlacement(placement: BannerPlacement, excludeId?: string): Promise<number> {
    return prisma.banner.count({
      where: {
        placement,
        isActive: true,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
  }

  async findActiveByPlacement(placement: BannerPlacement, atDate: Date = new Date()): Promise<Banner[]> {
    return prisma.banner.findMany({
      where: {
        placement,
        isActive: true,
        AND: [
          {
            OR: [{ startsAt: null }, { startsAt: { lte: atDate } }],
          },
          {
            OR: [{ endsAt: null }, { endsAt: { gte: atDate } }],
          },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findAll(filter: BannerFilterOptions): Promise<{ items: Banner[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(filter.placement && { placement: filter.placement }),
      ...(filter.isActive !== undefined && { isActive: filter.isActive }),
    };

    const [items, total] = await Promise.all([
      prisma.banner.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.banner.count({ where }),
    ]);

    return { items, total };
  }

  async reorder(items: BannerReorderItem[]): Promise<void> {
    await prisma.$transaction(
      items.map(item =>
        prisma.banner.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }
}

export const bannersRepository = new PrismaBannersRepository();
