import { prisma } from '@/config/database';
import { toNumberSafe } from '@/utils/currency.util';
import type {
  IWishlistRepository,
  WishlistEntity,
  WishlistItemEntity,
} from './wishlist.types';

export class WishlistRepository implements IWishlistRepository {
  private mapItem(item: {
    id: string;
    wishlistId: string;
    productId: string;
    variantId: string | null;
    createdAt: Date;
    product?: {
      id: string;
      name: string;
      slug: string;
      status: string;
      inventoryType: string;
      images?: Array<{ url: string; slot: string }>;
    };
    variant?: {
      id: string;
      sku: string;
      name: string;
      price: { toNumber(): number } | number;
      compareAtPrice: { toNumber(): number } | number | null;
      isActive: boolean;
      deletedAt: Date | null;
    } | null;
  }): WishlistItemEntity {
    const thumb = item.product?.images?.find(img => img.slot === 'THUMBNAIL')?.url ??
      item.product?.images?.[0]?.url ?? null;

    return {
      id: item.id,
      wishlistId: item.wishlistId,
      productId: item.productId,
      variantId: item.variantId,
      createdAt: item.createdAt,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            slug: item.product.slug,
            status: item.product.status,
            inventoryType: item.product.inventoryType,
            thumbnailUrl: thumb,
          }
        : undefined,
      variant: item.variant
        ? {
            id: item.variant.id,
            sku: item.variant.sku,
            name: item.variant.name,
            price: toNumberSafe(item.variant.price),
            compareAtPrice: item.variant.compareAtPrice ? toNumberSafe(item.variant.compareAtPrice) : null,
            isActive: item.variant.isActive,
            deletedAt: item.variant.deletedAt,
          }
        : null,
    };
  }

  private mapWishlist(wishlist: {
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    items?: Array<Parameters<WishlistRepository['mapItem']>[0]>;
  }): WishlistEntity {
    return {
      id: wishlist.id,
      userId: wishlist.userId,
      createdAt: wishlist.createdAt,
      updatedAt: wishlist.updatedAt,
      items: wishlist.items ? wishlist.items.map(item => this.mapItem(item)) : [],
    };
  }

  async findWishlistByUserId(userId: string): Promise<WishlistEntity | null> {
    const wishlist = await prisma.wishlist.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: {
                  where: { slot: 'THUMBNAIL' },
                  take: 1,
                },
              },
            },
            variant: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!wishlist) return null;
    return this.mapWishlist(wishlist as unknown as Parameters<WishlistRepository['mapWishlist']>[0]);
  }

  async createWishlist(userId: string): Promise<WishlistEntity> {
    const wishlist = await prisma.wishlist.create({
      data: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: {
                  where: { slot: 'THUMBNAIL' },
                  take: 1,
                },
              },
            },
            variant: true,
          },
        },
      },
    });

    return this.mapWishlist(wishlist as unknown as Parameters<WishlistRepository['mapWishlist']>[0]);
  }

  async addItem(data: {
    wishlistId: string;
    productId: string;
    variantId?: string | null;
  }): Promise<WishlistItemEntity> {
    const variantId = data.variantId ?? null;

    // Check for existing item to ensure idempotency
    const existing = await prisma.wishlistItem.findFirst({
      where: {
        wishlistId: data.wishlistId,
        productId: data.productId,
        variantId,
      },
      include: {
        product: {
          include: {
            images: {
              where: { slot: 'THUMBNAIL' },
              take: 1,
            },
          },
        },
        variant: true,
      },
    });

    if (existing) {
      return this.mapItem(existing as unknown as Parameters<WishlistRepository['mapItem']>[0]);
    }

    const created = await prisma.wishlistItem.create({
      data: {
        wishlistId: data.wishlistId,
        productId: data.productId,
        variantId,
      },
      include: {
        product: {
          include: {
            images: {
              where: { slot: 'THUMBNAIL' },
              take: 1,
            },
          },
        },
        variant: true,
      },
    });

    return this.mapItem(created as unknown as Parameters<WishlistRepository['mapItem']>[0]);
  }

  async findItem(wishlistId: string, variantIdOrProductId: string): Promise<WishlistItemEntity | null> {
    const item = await prisma.wishlistItem.findFirst({
      where: {
        wishlistId,
        OR: [
          { variantId: variantIdOrProductId },
          { productId: variantIdOrProductId },
        ],
      },
      include: {
        product: {
          include: {
            images: {
              where: { slot: 'THUMBNAIL' },
              take: 1,
            },
          },
        },
        variant: true,
      },
    });

    if (!item) return null;
    return this.mapItem(item as unknown as Parameters<WishlistRepository['mapItem']>[0]);
  }

  async removeItem(wishlistId: string, variantIdOrProductId: string): Promise<boolean> {
    const deleteResult = await prisma.wishlistItem.deleteMany({
      where: {
        wishlistId,
        OR: [
          { variantId: variantIdOrProductId },
          { productId: variantIdOrProductId },
        ],
      },
    });

    return deleteResult.count > 0;
  }

  async clearWishlist(wishlistId: string): Promise<void> {
    await prisma.wishlistItem.deleteMany({
      where: { wishlistId },
    });
  }
}

export const wishlistRepository = new WishlistRepository();
