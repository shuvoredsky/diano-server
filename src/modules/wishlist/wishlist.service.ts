import { AppError } from '@/utils/app-error';
import { prisma } from '@/config/database';
import { toMoneyString } from '@/utils/currency.util';
import { cartService } from '@/modules/cart/cart.service';
import { wishlistRepository } from './wishlist.repository';
import type {
  IWishlistRepository,
  WishlistEntity,
  WishlistResponseDto,
  WishlistItemDto,
} from './wishlist.types';

export class WishlistService {
  constructor(
    private readonly repo: IWishlistRepository = wishlistRepository,
    private readonly cartSvc = cartService,
  ) {}

  /**
   * Formats wishlist into a clean public DTO strictly stripping costPrice or private details
   */
  formatWishlistResponse(wishlist: WishlistEntity): WishlistResponseDto {
    const items: WishlistItemDto[] = wishlist.items.map(item => {
      const priceVal = item.variant?.price ?? null;
      const comparePriceVal = item.variant?.compareAtPrice ?? null;

      const isAvailable = Boolean(
        item.product &&
        item.product.status === 'ACTIVE' &&
        item.variant &&
        item.variant.isActive &&
        !item.variant.deletedAt,
      );

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.product?.name ?? 'Unknown Product',
        variantName: item.variant?.name ?? null,
        sku: item.variant?.sku ?? null,
        price: priceVal !== null ? toMoneyString(priceVal) : null,
        compareAtPrice: comparePriceVal !== null ? toMoneyString(comparePriceVal) : null,
        thumbnailUrl: item.product?.thumbnailUrl ?? null,
        inventoryType: item.product?.inventoryType ?? 'READY_STOCK',
        isAvailable,
        createdAt: item.createdAt.toISOString(),
      };
    });

    return {
      wishlist: {
        id: wishlist.id,
        userId: wishlist.userId,
        totalItems: items.length,
        items,
      },
    };
  }

  async getOrCreateWishlist(userId: string): Promise<WishlistEntity> {
    let wishlist = await this.repo.findWishlistByUserId(userId);
    if (!wishlist) {
      wishlist = await this.repo.createWishlist(userId);
    }
    return wishlist;
  }

  async getWishlist(userId: string): Promise<WishlistResponseDto> {
    const wishlist = await this.getOrCreateWishlist(userId);
    return this.formatWishlistResponse(wishlist);
  }

  async addItem(userId: string, input: { variantId: string; productId?: string }): Promise<WishlistResponseDto> {
    // 1. Verify variant and product active status
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!variant || variant.deletedAt || !variant.isActive) {
      throw AppError.badRequest('The requested product variant is unavailable or inactive.');
    }

    if (
      !variant.product ||
      variant.product.deletedAt ||
      variant.product.status !== 'ACTIVE' ||
      (variant.product.category && (!variant.product.category.isActive || variant.product.category.deletedAt))
    ) {
      throw AppError.badRequest('The requested product is unavailable or inactive.');
    }

    const wishlist = await this.getOrCreateWishlist(userId);

    // 2. Add item to wishlist (repository ensures idempotency)
    await this.repo.addItem({
      wishlistId: wishlist.id,
      productId: variant.productId,
      variantId: variant.id,
    });

    const refreshed = await this.repo.findWishlistByUserId(userId);
    return this.formatWishlistResponse(refreshed ?? wishlist);
  }

  async removeItem(userId: string, variantId: string): Promise<WishlistResponseDto> {
    const wishlist = await this.getOrCreateWishlist(userId);
    await this.repo.removeItem(wishlist.id, variantId);

    const refreshed = await this.repo.findWishlistByUserId(userId);
    return this.formatWishlistResponse(refreshed ?? wishlist);
  }

  async moveToCart(userId: string, variantId: string): Promise<{ wishlist: WishlistResponseDto; cartItemAdded: boolean }> {
    const wishlist = await this.getOrCreateWishlist(userId);
    const existing = await this.repo.findItem(wishlist.id, variantId);

    if (!existing) {
      throw AppError.notFound('Item was not found in your wishlist.');
    }

    // 1. Ensure user has an active cart
    const { cart } = await this.cartSvc.getOrCreateCart(userId);

    // 2. Add to user's cart (quantity 1)
    await this.cartSvc.addItem({
      cartId: cart.id,
      variantId,
      quantity: 1,
    });

    // 3. Remove from wishlist
    await this.repo.removeItem(wishlist.id, variantId);

    const refreshed = await this.repo.findWishlistByUserId(userId);
    return {
      wishlist: this.formatWishlistResponse(refreshed ?? wishlist),
      cartItemAdded: true,
    };
  }
}

export const wishlistService = new WishlistService();
