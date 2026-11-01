import { prisma } from '@/config/database';
import type { Prisma, Setting } from '@prisma/client';

export interface ISiteSettingsRepository {
  findByKey(key: string): Promise<Setting | null>;
  upsert(
    key: string,
    value: Prisma.InputJsonValue,
    isPublic?: boolean,
    description?: string,
  ): Promise<Setting>;
  findMany(keys?: string[]): Promise<Setting[]>;
}

export class PrismaSiteSettingsRepository implements ISiteSettingsRepository {
  async findByKey(key: string): Promise<Setting | null> {
    return prisma.setting.findUnique({
      where: { key },
    });
  }

  async upsert(
    key: string,
    value: Prisma.InputJsonValue,
    isPublic = false,
    description?: string,
  ): Promise<Setting> {
    return prisma.setting.upsert({
      where: { key },
      update: {
        value,
        isPublic,
        ...(description !== undefined && { description }),
      },
      create: {
        key,
        value,
        isPublic,
        description,
      },
    });
  }

  async findMany(keys?: string[]): Promise<Setting[]> {
    return prisma.setting.findMany({
      where: keys ? { key: { in: keys } } : undefined,
    });
  }
}

export const siteSettingsRepository = new PrismaSiteSettingsRepository();
