import { prisma } from '@/config/database';
import { toNumberSafe } from '@/utils/currency.util';
import type {
  ICartRepository,
  CartEntity,
  CartItemEntity,
} from './cart.types';

export class CartRepository implements ICartRepository {
  private mapItem(item: {
    id: string;
    cartId: string;
    variantId: string;
    quantity: number;
    priceSnapshot: { toNumber(): number } | number;
    createdAt: Date;
    updatedAt: Date;
    variant?: {
      id: string;
      sku: string;
      name: string;
      price: { toNumber(): number } | number;
      compareAtPrice: { toNumber(): number } | number | null;
      isActive: boolean;
      deletedAt: Date | null;
      product: {
        id: string;
        name: string;
        slug: string;
        status: string;
        inventoryType: string;
        deletedAt?: Date | null;
        images?: Array<{ url: string; slot: string }>;
        category?: {
          id: string;
          name: string;
          isActive: boolean;
          deletedAt: Date | null;
        } | null;
      };
    };
  }): CartItemEntity {
    const thumb = item.variant?.product?.images?.find(img => img.slot === 'THUMBNAIL')?.url ??
      item.variant?.product?.images?.[0]?.url ?? null;

    return {
      id: item.id,
      cartId: item.cartId,
      variantId: item.variantId,
      quantity: item.quantity,
      priceSnapshot: toNumberSafe(item.priceSnapshot),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      variant: item.variant
        ? {
            id: item.variant.id,
            sku: item.variant.sku,
            name: item.variant.name,
            price: toNumberSafe(item.variant.price),
            compareAtPrice: item.variant.compareAtPrice ? toNumberSafe(item.variant.compareAtPrice) : null,
            isActive: item.variant.isActive,
            deletedAt: item.variant.deletedAt,
            product: {
              id: item.variant.product.id,
              name: item.variant.product.name,
              slug: item.variant.product.slug,
              status: item.variant.product.status,
              inventoryType: item.variant.product.inventoryType,
              deletedAt: item.variant.product.deletedAt,
              thumbnailUrl: thumb,
              category: item.variant.product.category
                ? {
                    id: item.variant.product.category.id,
                    name: item.variant.product.category.name,
                    isActive: item.variant.product.category.isActive,
                    deletedAt: item.variant.product.category.deletedAt,
                  }
                : undefined,
            },
          }
        : undefined,
    };
  }

  private mapCart(cart: {
    id: string;
    userId: string | null;
    guestToken: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    items?: Array<Parameters<CartRepository['mapItem']>[0]>;
  }): CartEntity {
    return {
      id: cart.id,
      userId: cart.userId,
      guestToken: cart.guestToken,
      expiresAt: cart.expiresAt,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
      items: cart.items ? cart.items.map(item => this.mapItem(item)) : [],
    };
  }

  private get cartInclude() {
    return {
      items: {
        include: {
          variant: {
            include: {
              product: {
                include: {
                  images: {
                    select: { url: true, slot: true },
                    orderBy: { sortOrder: 'asc' as const },
                  },
                  category: {
                    select: { id: true, name: true, isActive: true, deletedAt: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  async findCartById(id: string): Promise<CartEntity | null> {
    const cart = await prisma.cart.findUnique({
      where: { id },
      include: this.cartInclude,
    });
    return cart ? this.mapCart(cart) : null;
  }

  async findCartByUserId(userId: string): Promise<CartEntity | null> {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: this.cartInclude,
    });
    return cart ? this.mapCart(cart) : null;
  }

  async findCartByGuestTokenHash(tokenHash: string): Promise<CartEntity | null> {
    const cart = await prisma.cart.findUnique({
      where: { guestToken: tokenHash },
      include: this.cartInclude,
    });
    return cart ? this.mapCart(cart) : null;
  }

  async createCart(data: {
    userId?: string;
    guestToken?: string;
    expiresAt?: Date;
  }): Promise<CartEntity> {
    const created = await prisma.cart.create({
      data: {
        userId: data.userId ?? null,
        guestToken: data.guestToken ?? null,
        expiresAt: data.expiresAt ?? null,
      },
      include: this.cartInclude,
    });
    return this.mapCart(created);
  }

  async addItem(data: {
    cartId: string;
    variantId: string;
    quantity: number;
    priceSnapshot: number;
  }): Promise<CartItemEntity> {
    const item = await prisma.cartItem.upsert({
      where: {
        cartId_variantId: {
          cartId: data.cartId,
          variantId: data.variantId,
        },
      },
      update: {
        quantity: data.quantity,
        priceSnapshot: data.priceSnapshot,
      },
      create: {
        cartId: data.cartId,
        variantId: data.variantId,
        quantity: data.quantity,
        priceSnapshot: data.priceSnapshot,
      },
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: { select: { url: true, slot: true } },
                category: { select: { id: true, name: true, isActive: true, deletedAt: true } },
              },
            },
          },
        },
      },
    });

    return this.mapItem(item);
  }

  async updateItemQuantity(
    cartId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItemEntity> {
    const item = await prisma.cartItem.update({
      where: {
        cartId_variantId: {
          cartId,
          variantId,
        },
      },
      data: { quantity },
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: { select: { url: true, slot: true } },
                category: { select: { id: true, name: true, isActive: true, deletedAt: true } },
              },
            },
          },
        },
      },
    });

    return this.mapItem(item);
  }

  async updateItemPriceSnapshot(itemId: string, newPrice: number): Promise<void> {
    await prisma.cartItem.update({
      where: { id: itemId },
      data: { priceSnapshot: newPrice },
    });
  }

  async removeItem(cartId: string, variantId: string): Promise<void> {
    await prisma.cartItem.deleteMany({
      where: { cartId, variantId },
    });
  }

  async clearCart(cartId: string): Promise<void> {
    await prisma.cartItem.deleteMany({
      where: { cartId },
    });
  }

  async deleteCart(cartId: string): Promise<void> {
    await prisma.cart.delete({
      where: { id: cartId },
    });
  }

  async cleanupExpiredGuestCarts(before: Date): Promise<{ count: number }> {
    const res = await prisma.cart.deleteMany({
      where: {
        userId: null,
        expiresAt: { lte: before },
      },
    });
    return { count: res.count };
  }
}

export const cartRepository = new CartRepository();
