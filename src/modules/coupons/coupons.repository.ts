import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import type {
  CouponEntity,
  CreateCouponInput,
  UpdateCouponInput,
  CouponFilter,
  FlashSaleEntity,
  CreateFlashSaleInput,
} from './coupons.types';

export class CouponsRepository {
  formatCoupon(row: {
    id: string;
    code: string;
    type: CouponEntity['type'];
    value: { toString(): string };
    minPurchase: { toString(): string };
    maxDiscount: { toString(): string } | null;
    startsAt: Date;
    expiresAt: Date;
    usageLimit: number | null;
    perUserLimit: number;
    usedCount: number;
    firstOrderOnly: boolean;
    allowOnSale: boolean;
    scopes: unknown;
    isActive: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): CouponEntity {
    return {
      id: row.id,
      code: row.code,
      type: row.type,
      value: row.value.toString(),
      minPurchase: row.minPurchase.toString(),
      maxDiscount: row.maxDiscount ? row.maxDiscount.toString() : null,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      usageLimit: row.usageLimit,
      perUserLimit: row.perUserLimit,
      usedCount: row.usedCount,
      firstOrderOnly: row.firstOrderOnly,
      allowOnSale: row.allowOnSale,
      scopes: row.scopes,
      isActive: row.isActive,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByCode(code: string): Promise<CouponEntity | null> {
    const normalized = code.trim().toUpperCase();
    const row = await prisma.coupon.findUnique({
      where: { code: normalized },
    });
    return row ? this.formatCoupon(row) : null;
  }

  async findById(id: string): Promise<CouponEntity | null> {
    const row = await prisma.coupon.findUnique({
      where: { id },
    });
    return row ? this.formatCoupon(row) : null;
  }

  async listCoupons(filter: CouponFilter): Promise<{ items: CouponEntity[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CouponWhereInput = {
      deletedAt: null,
    };

    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    if (filter.type) where.type = filter.type;
    if (filter.search) {
      where.code = { contains: filter.search.trim().toUpperCase() };
    }

    const [rows, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.coupon.count({ where }),
    ]);

    return {
      items: rows.map(r => this.formatCoupon(r)),
      total,
    };
  }

  async createCoupon(input: CreateCouponInput): Promise<CouponEntity> {
    const normalizedCode = input.code.trim().toUpperCase();

    const row = await prisma.coupon.create({
      data: {
        code: normalizedCode,
        type: input.type,
        value: input.value.toString(),
        minPurchase: (input.minPurchase ?? 0).toString(),
        maxDiscount: input.maxDiscount !== undefined && input.maxDiscount !== null
          ? input.maxDiscount.toString()
          : null,
        startsAt: new Date(input.startsAt),
        expiresAt: new Date(input.expiresAt),
        usageLimit: input.usageLimit ?? null,
        perUserLimit: input.perUserLimit ?? 1,
        firstOrderOnly: input.firstOrderOnly ?? false,
        allowOnSale: input.allowOnSale ?? true,
        scopes: (input.scopes || {}) as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
    });

    return this.formatCoupon(row);
  }

  async updateCoupon(id: string, input: UpdateCouponInput): Promise<CouponEntity> {
    const data: Prisma.CouponUpdateInput = {};

    if (input.code !== undefined) data.code = input.code.trim().toUpperCase();
    if (input.type !== undefined) data.type = input.type;
    if (input.value !== undefined) data.value = input.value.toString();
    if (input.minPurchase !== undefined) data.minPurchase = input.minPurchase.toString();
    if (input.maxDiscount !== undefined) {
      data.maxDiscount = input.maxDiscount !== null ? input.maxDiscount.toString() : null;
    }
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.expiresAt !== undefined) data.expiresAt = new Date(input.expiresAt);
    if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit;
    if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit;
    if (input.firstOrderOnly !== undefined) data.firstOrderOnly = input.firstOrderOnly;
    if (input.allowOnSale !== undefined) data.allowOnSale = input.allowOnSale;
    if (input.scopes !== undefined) data.scopes = input.scopes as Prisma.InputJsonValue;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const row = await prisma.coupon.update({
      where: { id },
      data,
    });

    return this.formatCoupon(row);
  }

  async softDeleteCoupon(id: string): Promise<void> {
    await prisma.coupon.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async getUserCouponUsageCount(couponId: string, userId: string): Promise<number> {
    return prisma.couponUsage.count({
      where: { couponId, userId },
    });
  }

  async getUserPriorOrderCount(userId: string): Promise<number> {
    return prisma.order.count({
      where: { customerId: userId, status: { notIn: ['CANCELLED'] } },
    });
  }

  /**
   * Atomic conditional increment: ensures usage limit is never exceeded under concurrency
   */
  async atomicIncrementUsage(
    couponId: string,
    tx: Prisma.TransactionClient = prisma,
  ): Promise<boolean> {
    const result = await tx.$executeRaw`
      UPDATE "Coupon"
      SET "usedCount" = "usedCount" + 1
      WHERE "id" = ${couponId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
    `;
    return result > 0;
  }

  async recordUsage(
    data: {
      couponId: string;
      orderId: string;
      userId: string;
      discountAmount: string;
    },
    tx: Prisma.TransactionClient = prisma,
  ): Promise<void> {
    await tx.couponUsage.create({
      data: {
        couponId: data.couponId,
        orderId: data.orderId,
        userId: data.userId,
        discountAmount: data.discountAmount,
      },
    });
  }

  // ==========================================
  // FLASH SALES
  // ==========================================

  async listActiveFlashSales(): Promise<FlashSaleEntity[]> {
    const now = new Date();
    const rows = await prisma.flashSale.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: {
        items: true,
      },
      orderBy: { endsAt: 'asc' },
    });

    return rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      items: r.items.map(i => ({
        id: i.id,
        flashSaleId: i.flashSaleId,
        variantId: i.variantId,
        discountPrice: i.discountPrice.toString(),
        stockLimit: i.stockLimit,
        soldCount: i.soldCount,
      })),
    }));
  }

  async createFlashSale(input: CreateFlashSaleInput): Promise<FlashSaleEntity> {
    const row = await prisma.flashSale.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        isActive: input.isActive ?? true,
        items: {
          create: input.items.map(i => ({
            variantId: i.variantId,
            discountPrice: i.discountPrice.toString(),
            stockLimit: i.stockLimit,
            soldCount: 0,
          })),
        },
      },
      include: { items: true },
    });

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: row.items.map(i => ({
        id: i.id,
        flashSaleId: i.flashSaleId,
        variantId: i.variantId,
        discountPrice: i.discountPrice.toString(),
        stockLimit: i.stockLimit,
        soldCount: i.soldCount,
      })),
    };
  }
}

export const couponsRepository = new CouponsRepository();
