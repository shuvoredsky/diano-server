import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CartService, CART_MAX_ITEM_QTY } from '@/modules/cart/cart.service';
import type { ICartRepository, CartEntity, CartItemEntity } from '@/modules/cart/cart.types';
import { prisma } from '@/config/database';
import { addCartItemSchema } from '@/modules/cart/cart.validation';

vi.mock('@/config/database', () => ({
  prisma: {
    productVariant: {
      findUnique: vi.fn(),
    },
    inventory: {
      findMany: vi.fn(),
    },
    cart: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe('CartService (Unit Tests with Mocked Repository & DB)', () => {
  let mockRepo: Partial<ICartRepository>;
  let service: CartService;

  const mockVariant = {
    id: 'var-1',
    sku: 'TSHIRT-BLK-M',
    name: 'Black T-Shirt (M)',
    price: 1200,
    compareAtPrice: 1500,
    isActive: true,
    deletedAt: null,
    product: {
      id: 'prod-1',
      name: 'Classic Black T-Shirt',
      slug: 'classic-black-tshirt',
      status: 'ACTIVE',
      inventoryType: 'READY_STOCK',
      deletedAt: null,
      thumbnailUrl: 'https://example.com/thumb.jpg',
      category: {
        id: 'cat-1',
        name: 'Apparel',
        isActive: true,
        deletedAt: null,
      },
    },
  };

  const sampleCart: CartEntity = {
    id: 'cart-1',
    userId: 'user-1',
    guestToken: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findCartById: vi.fn().mockResolvedValue(sampleCart),
      findCartByUserId: vi.fn().mockResolvedValue(sampleCart),
      findCartByGuestTokenHash: vi.fn().mockResolvedValue(null),
      createCart: vi.fn().mockImplementation(data =>
        Promise.resolve({
          id: 'new-cart',
          userId: data.userId ?? null,
          guestToken: data.guestToken ?? null,
          expiresAt: data.expiresAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [],
        }),
      ),
      addItem: vi.fn(),
      updateItemQuantity: vi.fn(),
      updateItemPriceSnapshot: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn(),
      clearCart: vi.fn(),
      deleteCart: vi.fn(),
      cleanupExpiredGuestCarts: vi.fn().mockResolvedValue({ count: 5 }),
    };

    service = new CartService(mockRepo as ICartRepository);
  });

  describe('Security & Identification', () => {
    it('hashes guest token consistently via SHA-256', () => {
      const raw = 'test-guest-token-12345';
      const hash1 = service.hashGuestToken(raw);
      const hash2 = service.hashGuestToken(raw);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string
    });

    it('rejects client-supplied price via strict validation schema', () => {
      const payloadWithPrice = {
        variantId: 'var-1',
        quantity: 2,
        price: 50, // Malicious client attempt
      };

      const result = addCartItemSchema.safeParse(payloadWithPrice);
      expect(result.success).toBe(false);
    });
  });

  describe('Add to Cart & Validation', () => {
    it('rejects adding inactive product variant', async () => {
      (prisma.productVariant.findUnique as any).mockResolvedValueOnce({
        ...mockVariant,
        isActive: false,
      });

      await expect(
        service.addItem({
          cartId: 'cart-1',
          variantId: 'var-1',
          quantity: 1,
        }),
      ).rejects.toThrow('Product variant is inactive or unavailable');
    });

    it('rejects adding variant if parent product is inactive', async () => {
      (prisma.productVariant.findUnique as any).mockResolvedValueOnce({
        ...mockVariant,
        product: {
          ...mockVariant.product,
          status: 'DRAFT',
        },
      });

      await expect(
        service.addItem({
          cartId: 'cart-1',
          variantId: 'var-1',
          quantity: 1,
        }),
      ).rejects.toThrow('Product is not active or available for purchase');
    });

    it('clamps quantity to available inventory stock for READY_STOCK', async () => {
      (prisma.productVariant.findUnique as any).mockResolvedValue(mockVariant);
      // Available stock = 5
      (prisma.inventory.findMany as any).mockResolvedValue([
        { onHand: 10, reserved: 3, damaged: 2 },
      ]);

      await expect(
        service.addItem({
          cartId: 'cart-1',
          variantId: 'var-1',
          quantity: 8, // Requesting 8 when only 5 available
        }),
      ).rejects.toThrow('exceeds available stock');
    });

    it('enforces maximum per-item limit', async () => {
      (prisma.productVariant.findUnique as any).mockResolvedValue(mockVariant);
      (prisma.inventory.findMany as any).mockResolvedValue([{ onHand: 100, reserved: 0, damaged: 0 }]);

      await expect(
        service.addItem({
          cartId: 'cart-1',
          variantId: 'var-1',
          quantity: CART_MAX_ITEM_QTY + 1,
        }),
      ).rejects.toThrow('Maximum allowed per item is');
    });

    it('successfully adds item using DB price snapshot', async () => {
      (prisma.productVariant.findUnique as any).mockResolvedValue(mockVariant);
      (prisma.inventory.findMany as any).mockResolvedValue([{ onHand: 20, reserved: 0, damaged: 0 }]);

      const createdItem: CartItemEntity = {
        id: 'ci-1',
        cartId: 'cart-1',
        variantId: 'var-1',
        quantity: 2,
        priceSnapshot: 1200,
        createdAt: new Date(),
        updatedAt: new Date(),
        variant: mockVariant as any,
      };

      (mockRepo.addItem as any).mockResolvedValueOnce(createdItem);
      (mockRepo.findCartById as any)
        .mockResolvedValueOnce(sampleCart)
        .mockResolvedValueOnce({
          ...sampleCart,
          items: [createdItem],
        });

      const res = await service.addItem({
        cartId: 'cart-1',
        variantId: 'var-1',
        quantity: 2,
      });

      expect(mockRepo.addItem).toHaveBeenCalledWith({
        cartId: 'cart-1',
        variantId: 'var-1',
        quantity: 2,
        priceSnapshot: 1200,
      });
      expect(res.cart.totals.subtotal).toBe('2400.00');
    });
  });

  describe('Cart Merging', () => {
    it('merges guest cart into user cart, clamping to limits and deleting guest cart', async () => {
      const guestCart: CartEntity = {
        id: 'guest-cart-1',
        userId: null,
        guestToken: 'hashed-guest-token',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'g-item-1',
            cartId: 'guest-cart-1',
            variantId: 'var-1',
            quantity: 7,
            priceSnapshot: 1200,
            createdAt: new Date(),
            updatedAt: new Date(),
            variant: mockVariant as any,
          },
        ],
      };

      const userCart: CartEntity = {
        ...sampleCart,
        items: [
          {
            id: 'u-item-1',
            cartId: 'cart-1',
            variantId: 'var-1',
            quantity: 5,
            priceSnapshot: 1200,
            createdAt: new Date(),
            updatedAt: new Date(),
            variant: mockVariant as any,
          },
        ],
      };

      (mockRepo.findCartByGuestTokenHash as any).mockResolvedValueOnce(guestCart);
      (mockRepo.findCartByUserId as any).mockResolvedValue(userCart);
      (prisma.productVariant.findUnique as any).mockResolvedValue(mockVariant);
      // Available stock = 15, but MAX limit is 10
      (prisma.inventory.findMany as any).mockResolvedValue([{ onHand: 20, reserved: 0, damaged: 5 }]);

      const result = await service.mergeCart('user-1', 'raw-guest-token');

      // 5 + 7 = 12, clamped to MAX_ITEM_QTY (10)
      expect(result.clampedItems).toHaveLength(1);
      expect(result.clampedItems[0]).toEqual({
        variantId: 'var-1',
        requestedQuantity: 12,
        mergedQuantity: 10,
        reason: 'CLAMPED_TO_LIMIT',
      });

      expect(mockRepo.updateItemQuantity).toHaveBeenCalledWith('cart-1', 'var-1', 10);
      expect(mockRepo.deleteCart).toHaveBeenCalledWith('guest-cart-1');
    });

    it('returns empty merge result idempotently if guest cart does not exist', async () => {
      (mockRepo.findCartByGuestTokenHash as any).mockResolvedValueOnce(null);

      const result = await service.mergeCart('user-1', 'unknown-token');
      expect(result.itemsCount).toBe(0);
      expect(result.clampedItems).toHaveLength(0);
    });
  });

  describe('POST /cart/validate', () => {
    it('detects price changes, auto-applies new price, and flags issues', async () => {
      const cartWithOldPrice: CartEntity = {
        ...sampleCart,
        items: [
          {
            id: 'item-1',
            cartId: 'cart-1',
            variantId: 'var-1',
            quantity: 2,
            priceSnapshot: 1000, // Old snapshot was 1000
            createdAt: new Date(),
            updatedAt: new Date(),
            variant: {
              ...mockVariant,
              price: 1250, // Current price in DB is 1250
            } as any,
          },
        ],
      };

      (mockRepo.findCartById as any).mockResolvedValue(cartWithOldPrice);
      (prisma.productVariant.findUnique as any).mockResolvedValue({
        ...mockVariant,
        price: 1250,
      });
      (prisma.inventory.findMany as any).mockResolvedValue([{ onHand: 10, reserved: 0, damaged: 0 }]);

      const validation = await service.validateCart('cart-1');

      expect(mockRepo.updateItemPriceSnapshot).toHaveBeenCalledWith('item-1', 1250);
      expect(validation.issues).toContainEqual(
        expect.objectContaining({
          issue: 'PRICE_CHANGED',
          oldPrice: '1000.00',
          newPrice: '1250.00',
        }),
      );
      // Valid because price change is auto-applied and not blocking
      expect(validation.isValid).toBe(true);
    });

    it('flags OUT_OF_STOCK and marks cart as invalid', async () => {
      const cartWithOos: CartEntity = {
        ...sampleCart,
        items: [
          {
            id: 'item-1',
            cartId: 'cart-1',
            variantId: 'var-1',
            quantity: 2,
            priceSnapshot: 1200,
            createdAt: new Date(),
            updatedAt: new Date(),
            variant: mockVariant as any,
          },
        ],
      };

      (mockRepo.findCartById as any).mockResolvedValue(cartWithOos);
      (prisma.productVariant.findUnique as any).mockResolvedValue(mockVariant);
      (prisma.inventory.findMany as any).mockResolvedValue([{ onHand: 0, reserved: 0, damaged: 0 }]);

      const validation = await service.validateCart('cart-1');

      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContainEqual(
        expect.objectContaining({
          issue: 'OUT_OF_STOCK',
          availableQuantity: 0,
        }),
      );
    });
  });

  describe('Guest Cart Cleanup Hook', () => {
    it('executes cleanupExpiredGuestCarts successfully', async () => {
      const cutoff = new Date();
      const res = await service.cleanupExpiredGuestCarts(cutoff);

      expect(mockRepo.cleanupExpiredGuestCarts).toHaveBeenCalledWith(cutoff);
      expect(res.count).toBe(5);
    });
  });
});
