import crypto from 'crypto';
import Decimal from 'decimal.js';
import { AppError } from '@/utils/app-error';
import { prisma } from '@/config/database';
import { toNumberSafe, toMoneyString } from '@/utils/currency.util';
import { cartRepository } from './cart.repository';
import type {
  ICartRepository,
  CartEntity,
  CartResponseDto,
  CartTotals,
  CartValidationResult,
  CartValidationIssue,
  CartMergeResult,
  CartMergeClampedItem,
} from './cart.types';

export const CART_MAX_ITEM_QTY = Number(process.env.CART_MAX_ITEM_QUANTITY) || 10;
export const CART_MAX_DISTINCT_ITEMS = Number(process.env.CART_MAX_DISTINCT_ITEMS) || 50;
export const GUEST_CART_TTL_DAYS = 30;

export class CartService {
  constructor(private readonly repo: ICartRepository = cartRepository) {}

  /**
   * Hashes raw guest token via SHA-256 for secure database lookup/storage
   */
  hashGuestToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generates a cryptographically strong 32-byte hex guest token
   */
  generateGuestToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Calculates subtotal and counts using Decimal precision
   */
  calculateTotals(items: CartEntity['items']): CartTotals {
    let subtotalDec = new Decimal(0);
    let totalUnits = 0;

    for (const item of items) {
      const price = item.variant?.price ?? item.priceSnapshot;
      const lineTotal = new Decimal(price).times(item.quantity);
      subtotalDec = subtotalDec.plus(lineTotal);
      totalUnits += item.quantity;
    }

    return {
      subtotal: subtotalDec.toFixed(2),
      totalItems: totalUnits,
      distinctItems: items.length,
    };
  }

  /**
   * Formats cart entity into standard CartResponseDto
   */
  formatCartResponse(cart: CartEntity): CartResponseDto {
    const totals = this.calculateTotals(cart.items);

    return {
      cart: {
        id: cart.id,
        userId: cart.userId,
        isGuest: !cart.userId,
        items: cart.items.map(item => {
          const currentPrice = item.variant?.price ?? item.priceSnapshot;
          const lineTotal = new Decimal(currentPrice).times(item.quantity).toFixed(2);

          return {
            id: item.id,
            variantId: item.variantId,
            productId: item.variant?.product.id ?? '',
            name: item.variant?.name ?? 'Product Item',
            sku: item.variant?.sku ?? '',
            quantity: item.quantity,
            price: toMoneyString(currentPrice),
            lineTotal,
            compareAtPrice: item.variant?.compareAtPrice ? toMoneyString(item.variant.compareAtPrice) : null,
            inventoryType: item.variant?.product.inventoryType ?? 'READY_STOCK',
            thumbnailUrl: item.variant?.product.thumbnailUrl ?? null,
          };
        }),
        totals,
      },
    };
  }

  /**
   * Calculates live available stock (onHand - reserved - damaged) across all warehouses
   */
  async getVariantAvailableStock(variantId: string): Promise<number> {
    const rows = await prisma.inventory.findMany({
      where: { variantId },
      select: { onHand: true, reserved: true, damaged: true },
    });

    return rows.reduce((acc, row) => acc + Math.max(0, row.onHand - row.reserved - row.damaged), 0);
  }

  /**
   * Resolves or initializes cart for user or guest
   */
  async getOrCreateCart(
    userId?: string,
    rawGuestToken?: string,
  ): Promise<{ cart: CartEntity; newRawGuestToken?: string }> {
    if (userId) {
      let cart = await this.repo.findCartByUserId(userId);
      if (!cart) {
        cart = await this.repo.createCart({ userId });
      }
      return { cart };
    }

    if (rawGuestToken) {
      const tokenHash = this.hashGuestToken(rawGuestToken);
      const cart = await this.repo.findCartByGuestTokenHash(tokenHash);
      if (cart && (!cart.expiresAt || cart.expiresAt > new Date())) {
        return { cart };
      }
    }

    // Generate new guest cart
    const newRawToken = this.generateGuestToken();
    const tokenHash = this.hashGuestToken(newRawToken);
    const expiresAt = new Date(Date.now() + GUEST_CART_TTL_DAYS * 24 * 60 * 60 * 1000);

    const cart = await this.repo.createCart({
      guestToken: tokenHash,
      expiresAt,
    });

    return { cart, newRawGuestToken: newRawToken };
  }

  /**
   * Add Item to Cart
   * Strictly server-side pricing, active catalog checks, and stock boundaries
   */
  async addItem(params: {
    cartId: string;
    variantId: string;
    quantity: number;
  }): Promise<CartResponseDto> {
    if (params.quantity <= 0) {
      throw AppError.badRequest('Quantity must be greater than zero');
    }

    const variant = await prisma.productVariant.findUnique({
      where: { id: params.variantId },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!variant || variant.deletedAt || !variant.isActive) {
      throw AppError.notFound('Product variant is inactive or unavailable');
    }

    const product = variant.product;
    if (product.status !== 'ACTIVE' || product.deletedAt) {
      throw AppError.badRequest('Product is not active or available for purchase');
    }

    if (product.category?.deletedAt || (product.category && !product.category.isActive)) {
      throw AppError.badRequest('Product category is currently inactive');
    }

    // Retrieve active cart
    const cart = await this.repo.findCartById(params.cartId);
    if (!cart) {
      throw AppError.notFound('Cart not found');
    }

    const existingItem = cart.items.find(i => i.variantId === params.variantId);
    const existingQuantity = existingItem?.quantity ?? 0;
    const finalQuantity = existingQuantity + params.quantity;

    if (!existingItem && cart.items.length >= CART_MAX_DISTINCT_ITEMS) {
      throw AppError.badRequest(`Cart cannot contain more than ${CART_MAX_DISTINCT_ITEMS} distinct items`);
    }

    if (finalQuantity > CART_MAX_ITEM_QTY) {
      throw AppError.badRequest(
        `Cannot add ${params.quantity} more units. Maximum allowed per item is ${CART_MAX_ITEM_QTY} (currently in cart: ${existingQuantity})`,
      );
    }

    // Stock check for READY_STOCK products
    if (product.inventoryType === 'READY_STOCK') {
      const availableStock = await this.getVariantAvailableStock(params.variantId);
      if (availableStock <= 0) {
        throw AppError.badRequest('Product variant is currently out of stock');
      }
      if (finalQuantity > availableStock) {
        throw AppError.badRequest(
          `Requested quantity (${finalQuantity}) exceeds available stock (${availableStock})`,
        );
      }
    }

    // Server-side price snapshot
    const serverPrice = toNumberSafe(variant.price);

    await this.repo.addItem({
      cartId: params.cartId,
      variantId: params.variantId,
      quantity: finalQuantity,
      priceSnapshot: serverPrice,
    });

    const updatedCart = (await this.repo.findCartById(params.cartId)) ?? cart;
    return this.formatCartResponse(updatedCart);
  }

  /**
   * Update item quantity in cart
   */
  async updateItemQuantity(params: {
    cartId: string;
    variantId: string;
    quantity: number;
  }): Promise<CartResponseDto> {
    if (params.quantity <= 0) {
      return this.removeItem(params.cartId, params.variantId);
    }

    if (params.quantity > CART_MAX_ITEM_QTY) {
      throw AppError.badRequest(`Maximum allowed per item is ${CART_MAX_ITEM_QTY}`);
    }

    const variant = await prisma.productVariant.findUnique({
      where: { id: params.variantId },
      include: { product: true },
    });
    if (!variant || !variant.isActive || variant.deletedAt) {
      throw AppError.notFound('Product variant is unavailable');
    }

    if (variant.product.inventoryType === 'READY_STOCK') {
      const availableStock = await this.getVariantAvailableStock(params.variantId);
      if (params.quantity > availableStock) {
        throw AppError.badRequest(
          `Requested quantity (${params.quantity}) exceeds available stock (${availableStock})`,
        );
      }
    }

    await this.repo.updateItemQuantity(params.cartId, params.variantId, params.quantity);
    const updatedCart = await this.repo.findCartById(params.cartId);
    return this.formatCartResponse(updatedCart!);
  }

  /**
   * Remove single item from cart
   */
  async removeItem(cartId: string, variantId: string): Promise<CartResponseDto> {
    await this.repo.removeItem(cartId, variantId);
    const updatedCart = await this.repo.findCartById(cartId);
    return this.formatCartResponse(updatedCart!);
  }

  /**
   * Clear entire cart
   */
  async clearCart(cartId: string): Promise<CartResponseDto> {
    await this.repo.clearCart(cartId);
    const updatedCart = await this.repo.findCartById(cartId);
    return this.formatCartResponse(updatedCart!);
  }

  /**
   * Merge Guest Cart into User Cart (Post-Login)
   * Enforces item clamping, stock clamping, and idempotency
   */
  async mergeCart(userId: string, rawGuestToken?: string): Promise<CartMergeResult> {
    const userCart = (await this.getOrCreateCart(userId)).cart;

    if (!rawGuestToken) {
      return {
        mergedCartId: userCart.id,
        itemsCount: userCart.items.length,
        clampedItems: [],
      };
    }

    const guestTokenHash = this.hashGuestToken(rawGuestToken);
    const guestCart = await this.repo.findCartByGuestTokenHash(guestTokenHash);

    if (!guestCart || guestCart.items.length === 0) {
      return {
        mergedCartId: userCart.id,
        itemsCount: userCart.items.length,
        clampedItems: [],
      };
    }

    const clampedItems: CartMergeClampedItem[] = [];
    const userItemsMap = new Map(userCart.items.map(i => [i.variantId, i]));

    for (const guestItem of guestCart.items) {
      const existingUserItem = userItemsMap.get(guestItem.variantId);
      const existingQty = existingUserItem?.quantity ?? 0;
      const requestedTotal = existingQty + guestItem.quantity;

      let mergedQty = requestedTotal;
      let clampReason: 'CLAMPED_TO_STOCK' | 'CLAMPED_TO_LIMIT' | null = null;

      // 1. Clamp to max allowed item limit
      if (mergedQty > CART_MAX_ITEM_QTY) {
        mergedQty = CART_MAX_ITEM_QTY;
        clampReason = 'CLAMPED_TO_LIMIT';
      }

      // 2. Clamp to available stock for READY_STOCK
      if (guestItem.variant?.product.inventoryType === 'READY_STOCK') {
        const available = await this.getVariantAvailableStock(guestItem.variantId);
        if (mergedQty > available) {
          mergedQty = Math.max(0, available);
          clampReason = 'CLAMPED_TO_STOCK';
        }
      }

      if (mergedQty < requestedTotal && clampReason) {
        clampedItems.push({
          variantId: guestItem.variantId,
          requestedQuantity: requestedTotal,
          mergedQuantity: mergedQty,
          reason: clampReason,
        });
      }

      if (mergedQty > 0) {
        if (existingUserItem) {
          await this.repo.updateItemQuantity(userCart.id, guestItem.variantId, mergedQty);
        } else {
          const price = guestItem.variant?.price ?? guestItem.priceSnapshot;
          await this.repo.addItem({
            cartId: userCart.id,
            variantId: guestItem.variantId,
            quantity: mergedQty,
            priceSnapshot: price,
          });
        }
      }
    }

    // Delete guest cart after merge to guarantee idempotency
    await this.repo.deleteCart(guestCart.id);

    const refreshedUserCart = await this.repo.findCartByUserId(userId);

    return {
      mergedCartId: userCart.id,
      itemsCount: refreshedUserCart?.items.length ?? 0,
      clampedItems,
    };
  }

  /**
   * Validate Cart items against live catalog & stock
   * Auto-applies price changes with clear issue reporting
   */
  async validateCart(cartId: string): Promise<CartValidationResult> {
    const cart = await this.repo.findCartById(cartId);

    if (!cart) {
      throw AppError.notFound('Cart not found');
    }

    const issues: CartValidationIssue[] = [];

    for (const item of cart.items) {
      const variant = item.variant;

      // 1. Availability Check
      if (
        !variant ||
        variant.deletedAt ||
        !variant.isActive ||
        variant.product.status !== 'ACTIVE' ||
        variant.product.deletedAt ||
        variant.product.category?.deletedAt ||
        (variant.product.category && !variant.product.category.isActive)
      ) {
        issues.push({
          variantId: item.variantId,
          productId: variant?.product.id,
          issue: 'UNAVAILABLE',
          message: `Item '${variant?.name ?? item.variantId}' is no longer available for purchase.`,
        });
        continue;
      }

      // 2. Stock Check
      if (variant.product.inventoryType === 'READY_STOCK') {
        const available = await this.getVariantAvailableStock(item.variantId);
        if (available <= 0) {
          issues.push({
            variantId: item.variantId,
            productId: variant.product.id,
            issue: 'OUT_OF_STOCK',
            message: `Item '${variant.name}' is currently out of stock.`,
            availableQuantity: 0,
            requestedQuantity: item.quantity,
          });
        } else if (item.quantity > available) {
          issues.push({
            variantId: item.variantId,
            productId: variant.product.id,
            issue: 'INSUFFICIENT_STOCK',
            message: `Only ${available} units available in stock for '${variant.name}'.`,
            availableQuantity: available,
            requestedQuantity: item.quantity,
          });
        }
      }

      // 3. Price Discrepancy Check (Auto-apply with notice)
      const currentPrice = toNumberSafe(variant.price);
      const snapshotPrice = toNumberSafe(item.priceSnapshot);

      if (currentPrice !== snapshotPrice) {
        await this.repo.updateItemPriceSnapshot(item.id, currentPrice);

        issues.push({
          variantId: item.variantId,
          productId: variant.product.id,
          issue: 'PRICE_CHANGED',
          message: `Price for '${variant.name}' has changed from ${toMoneyString(snapshotPrice)} to ${toMoneyString(currentPrice)}. Cart updated automatically.`,
          oldPrice: toMoneyString(snapshotPrice),
          newPrice: toMoneyString(currentPrice),
        });
      }
    }

    const refreshedCart = (await this.repo.findCartByUserId(cart.userId ?? '')) ||
      (cart.guestToken ? await this.repo.findCartByGuestTokenHash(cart.guestToken) : null);

    const updatedTotals = this.calculateTotals(refreshedCart?.items ?? []);

    return {
      isValid: issues.filter(i => i.issue !== 'PRICE_CHANGED').length === 0,
      issues,
      updatedTotals,
    };
  }

  /**
   * Cleanup expired guest carts
   */
  async cleanupExpiredGuestCarts(before: Date): Promise<{ count: number }> {
    return this.repo.cleanupExpiredGuestCarts(before);
  }
}

export const cartService = new CartService();
