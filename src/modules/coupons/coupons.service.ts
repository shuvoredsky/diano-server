import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { couponsRepository, type CouponsRepository } from './coupons.repository';
import { couponCalculator, type CouponCalculator } from './coupons.calculator';
import type {
  CouponEntity,
  CreateCouponInput,
  UpdateCouponInput,
  CouponFilter,
  CouponDiscountResult,
  CouponItemContext,
  FlashSaleEntity,
  CreateFlashSaleInput,
  UpdateFlashSaleInput,
  FlashSaleFilter,
} from './coupons.types';

export class CouponsService {
  constructor(
    private readonly repo: CouponsRepository = couponsRepository,
    private readonly calc: CouponCalculator = couponCalculator,
    private readonly audit: IAuditService = auditService,
  ) {}

  // ==========================================
  // ADMIN CRUD
  // ==========================================

  async listCoupons(filter: CouponFilter): Promise<{ items: CouponEntity[]; total: number }> {
    return this.repo.listCoupons(filter);
  }

  async getCouponById(id: string): Promise<CouponEntity> {
    const coupon = await this.repo.findById(id);
    if (!coupon || coupon.deletedAt) {
      throw AppError.notFound(`Coupon '${id}' not found`);
    }
    return coupon;
  }

  async createCoupon(
    input: CreateCouponInput,
    actor?: { id: string },
  ): Promise<CouponEntity> {
    const existing = await this.repo.findByCode(input.code);
    if (existing && !existing.deletedAt) {
      throw AppError.conflict(`Coupon code '${input.code.toUpperCase()}' already exists`);
    }

    const coupon = await this.repo.createCoupon(input);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'COUPON_CREATED',
      targetType: 'COUPON',
      targetId: coupon.id,
      metadata: { code: coupon.code, type: coupon.type, value: coupon.value },
    });

    return coupon;
  }

  async updateCoupon(
    id: string,
    input: UpdateCouponInput,
    actor?: { id: string },
  ): Promise<CouponEntity> {
    const coupon = await this.getCouponById(id);

    if (input.code && input.code.toUpperCase() !== coupon.code) {
      const existing = await this.repo.findByCode(input.code);
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw AppError.conflict(`Coupon code '${input.code.toUpperCase()}' is already in use`);
      }
    }

    const updated = await this.repo.updateCoupon(id, input);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'COUPON_UPDATED',
      targetType: 'COUPON',
      targetId: id,
      metadata: input as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async deleteCoupon(id: string, actor?: { id: string }): Promise<void> {
    await this.getCouponById(id);
    await this.repo.softDeleteCoupon(id);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'COUPON_DELETED',
      targetType: 'COUPON',
      targetId: id,
    });
  }

  // ==========================================
  // CHECKOUT SESSION INTEGRATION
  // ==========================================

  async applyCouponToSession(
    sessionId: string,
    couponCode: string,
    _actor?: { userId?: string },
  ): Promise<CouponDiscountResult> {
    // 1. Fetch checkout session
    const session = await prisma.checkoutSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      throw AppError.notFound(`Checkout session '${sessionId}' not found`);
    }
    if (session.status !== 'ACTIVE') {
      throw AppError.badRequest('Checkout session is not active');
    }
    if (session.expiresAt < new Date()) {
      throw AppError.badRequest('Checkout session has expired');
    }

    // 2. Fetch coupon by code
    const coupon = await this.repo.findByCode(couponCode);
    if (!coupon || coupon.deletedAt) {
      throw AppError.notFound('Invalid or non-existent coupon code', 'COUPON_NOT_FOUND');
    }

    // 3. Inspect items in session
    const cartSnapshot = session.cartSnapshot as {
      items?: Array<{ variantId: string; price: string; quantity: number; lineTotal: string }>;
      shippingCharge?: string;
      tax?: string;
    };

    const items = cartSnapshot?.items || [];
    if (items.length === 0) {
      throw AppError.badRequest('No items found in checkout session');
    }

    // Fetch variant on-sale attributes to enforce allowOnSale rule
    const variantIds = items.map(i => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    const variantMap = new Map(variants.map(v => [v.id, v]));

    let calculatedSubtotalDec = new Decimal(0);
    const itemContexts: CouponItemContext[] = items.map(i => {
      const v = variantMap.get(i.variantId);
      const isOnSale = Boolean(
        (v?.compareAtPrice && new Decimal(v.compareAtPrice).greaterThan(new Decimal(v.price))) ||
          v?.product?.specialOffer ||
          (v?.product?.discountType && v.product.discountType !== 'NONE'),
      );
      calculatedSubtotalDec = calculatedSubtotalDec.plus(new Decimal(i.lineTotal));

      return {
        variantId: i.variantId,
        price: i.price,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        isOnSale,
      };
    });

    // 4. Fetch user context
    const userId = session.userId;
    let userCouponUsageCount = 0;
    let userPriorOrderCount = 0;

    if (userId) {
      [userCouponUsageCount, userPriorOrderCount] = await Promise.all([
        this.repo.getUserCouponUsageCount(coupon.id, userId),
        this.repo.getUserPriorOrderCount(userId),
      ]);
    }

    // 5. Evaluate coupon
    const shippingCharge = cartSnapshot.shippingCharge || '60.00';
    const result = this.calc.calculateDiscount({
      coupon,
      items: itemContexts,
      subtotal: calculatedSubtotalDec.toFixed(2),
      shippingCharge,
      userId,
      userPriorOrderCount,
      userCouponUsageCount,
      now: new Date(),
    });

    if (!result.isValid) {
      throw AppError.badRequest(result.error || 'Coupon cannot be applied', result.errorCode);
    }

    // 6. Update session cartSnapshot with applied coupon
    const updatedSnapshot = {
      ...cartSnapshot,
      couponCode: coupon.code,
      couponId: coupon.id,
      discount: result.discountAmount,
      shippingDiscount: result.shippingDiscountAmount,
      grandTotal: result.newGrandTotal,
    };

    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: {
        cartSnapshot: updatedSnapshot as unknown as Prisma.InputJsonValue,
        checkoutValue: Number(result.newGrandTotal),
      },
    });

    return result;
  }

  async removeCouponFromSession(sessionId: string): Promise<void> {
    const session = await prisma.checkoutSession.findUnique({
      where: { sessionId },
    });

    if (!session) throw AppError.notFound(`Checkout session '${sessionId}' not found`);

    const cartSnapshot = session.cartSnapshot as {
      items?: Array<{ lineTotal: string }>;
      shippingCharge?: string;
      tax?: string;
      [key: string]: unknown;
    };

    let subtotalDec = new Decimal(0);
    for (const item of cartSnapshot.items || []) {
      subtotalDec = subtotalDec.plus(new Decimal(item.lineTotal));
    }

    const shippingChargeDec = new Decimal(cartSnapshot.shippingCharge || '60.00');
    const taxDec = new Decimal(cartSnapshot.tax || '0.00');
    const recalculatedGrandTotal = subtotalDec.plus(shippingChargeDec).plus(taxDec);

    const updatedSnapshot = {
      ...cartSnapshot,
      couponCode: null,
      couponId: null,
      discount: '0.00',
      shippingDiscount: '0.00',
      grandTotal: recalculatedGrandTotal.toFixed(2),
    };

    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: {
        cartSnapshot: updatedSnapshot as unknown as Prisma.InputJsonValue,
        checkoutValue: recalculatedGrandTotal.toNumber(),
      },
    });
  }

  // ==========================================
  // ATOMIC CONSUMPTION IN ORDER CREATION
  // ==========================================

  async consumeCouponInOrder(
    couponId: string,
    orderId: string,
    customerId: string,
    discountAmount: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const updated = await this.repo.atomicIncrementUsage(couponId, tx);
    if (!updated) {
      throw AppError.badRequest(
        'The coupon usage limit was reached just now. Please try again without the coupon.',
        'COUPON_EXHAUSTED',
      );
    }

    await this.repo.recordUsage(
      {
        couponId,
        orderId,
        userId: customerId,
        discountAmount,
      },
      tx,
    );
  }

  // ==========================================
  // FLASH SALES
  // ==========================================

  async listActiveFlashSales(): Promise<FlashSaleEntity[]> {
    return this.repo.listActiveFlashSales();
  }

  async listAdminFlashSales(filter: FlashSaleFilter): Promise<{ items: FlashSaleEntity[]; total: number }> {
    return this.repo.listAdminFlashSales(filter);
  }

  async getFlashSaleById(id: string): Promise<FlashSaleEntity> {
    const sale = await this.repo.findFlashSaleById(id);
    if (!sale) throw AppError.notFound(`Flash sale '${id}' not found`);
    return sale;
  }

  async createFlashSale(
    input: CreateFlashSaleInput,
    actor?: { id: string },
  ): Promise<FlashSaleEntity> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt >= endsAt) {
      throw AppError.badRequest('endsAt must be after startsAt');
    }

    const sale = await prisma.$transaction(async tx => {
      // Validate overlap/conflict rules inside transaction if active
      if (input.isActive ?? true) {
        const variantIds = input.items.map(i => i.variantId);
        const conflicts = await tx.flashSaleItem.findMany({
          where: {
            variantId: { in: variantIds },
            flashSale: {
              isActive: true,
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          },
          include: { flashSale: { select: { title: true } } },
        });

        const conflict = conflicts[0];
        if (conflict) {
          throw AppError.badRequest(
            `Variant '${conflict.variantId}' is already included in an overlapping active flash sale '${conflict.flashSale.title}'`,
          );
        }
      }

      return this.repo.createFlashSale(input, tx);
    });

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'FLASH_SALE_CREATED',
      targetType: 'FLASH_SALE',
      targetId: sale.id,
      metadata: { title: sale.title, startsAt: sale.startsAt, endsAt: sale.endsAt },
    });

    return sale;
  }

  async updateFlashSale(
    id: string,
    input: UpdateFlashSaleInput,
    actor?: { id: string },
  ): Promise<FlashSaleEntity> {
    const sale = await prisma.$transaction(async tx => {
      const existing = await this.repo.findFlashSaleById(id, tx);
      if (!existing) {
        throw AppError.notFound(`Flash sale '${id}' not found`);
      }

      const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
      if (startsAt >= endsAt) {
        throw AppError.badRequest('endsAt must be after startsAt');
      }

      // Resolve isActive status from action/status/isActive
      let isActive: boolean;
      if (
        input.action === 'CANCEL' ||
        input.action === 'END' ||
        input.status === 'CANCELLED' ||
        input.status === 'ENDED'
      ) {
        isActive = false;
      } else if (input.action === 'ACTIVATE' || input.status === 'ACTIVE') {
        isActive = true;
      } else if (input.isActive !== undefined) {
        isActive = input.isActive;
      } else {
        isActive = existing.isActive;
      }

      // Validate overlap conflicts inside transaction if active
      if (isActive) {
        const variantIds = input.items
          ? input.items.map(i => i.variantId)
          : (existing.items || []).map(i => i.variantId);

        if (variantIds.length > 0) {
          const conflicts = await tx.flashSaleItem.findMany({
            where: {
              variantId: { in: variantIds },
              flashSaleId: { not: id },
              flashSale: {
                isActive: true,
                startsAt: { lt: endsAt },
                endsAt: { gt: startsAt },
              },
            },
            include: { flashSale: { select: { title: true } } },
          });

          const conflict = conflicts[0];
          if (conflict) {
            throw AppError.badRequest(
              `Variant '${conflict.variantId}' is already included in an overlapping active flash sale '${conflict.flashSale.title}'`,
            );
          }
        }
      }

      const title = input.title ?? input.name ?? existing.title;
      const description = input.description !== undefined ? input.description : existing.description;

      const updated = await tx.flashSale.update({
        where: { id },
        data: {
          title,
          description,
          startsAt,
          endsAt,
          isActive,
          ...(input.items
            ? {
                items: {
                  deleteMany: {},
                  create: input.items.map(i => ({
                    variantId: i.variantId,
                    discountPrice: i.discountPrice.toString(),
                    stockLimit: i.stockLimit,
                    soldCount: 0,
                  })),
                },
              }
            : {}),
        },
        include: { items: true },
      });

      return this.repo.formatFlashSale(updated);
    });

    const isCancelAction =
      input.action === 'CANCEL' ||
      input.action === 'END' ||
      input.status === 'CANCELLED' ||
      input.status === 'ENDED' ||
      input.isActive === false;

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: isCancelAction ? 'FLASH_SALE_CANCELLED' : 'FLASH_SALE_UPDATED',
      targetType: 'FLASH_SALE',
      targetId: sale.id,
      metadata: {
        title: sale.title,
        isActive: sale.isActive,
        startsAt: sale.startsAt,
        endsAt: sale.endsAt,
        action: input.action,
      },
    });

    return sale;
  }

  async cancelFlashSale(id: string, actor?: { id: string }): Promise<FlashSaleEntity> {
    return this.updateFlashSale(id, { action: 'CANCEL' }, actor);
  }

  async deleteFlashSale(id: string, actor?: { id: string }): Promise<void> {
    await prisma.$transaction(async tx => {
      const existing = await this.repo.findFlashSaleById(id, tx);
      if (!existing) {
        throw AppError.notFound(`Flash sale '${id}' not found`);
      }

      if (existing.startsAt <= new Date()) {
        throw AppError.badRequest(
          'Cannot delete a flash sale that has already started. Cancel or end it instead.',
        );
      }

      await this.repo.deleteFlashSale(id, tx);
    });

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'FLASH_SALE_DELETED',
      targetType: 'FLASH_SALE',
      targetId: id,
    });
  }
}

export const couponsService = new CouponsService();
