import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import type { IWishlistRepository, WishlistEntity } from '@/modules/wishlist/wishlist.types';
import { prisma } from '@/config/database';

vi.mock('@/config/database', () => ({
  prisma: {
    productVariant: {
      findUnique: vi.fn(),
    },
  },
}));

describe('WishlistService (Unit Tests with Mocked Repository)', () => {
  let mockRepo: Partial<IWishlistRepository>;
  let mockCartService: {
    getOrCreateCart: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
  };
  let service: WishlistService;

  const mockVariant = {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'TSHIRT-BLK-M',
    name: 'Black T-Shirt (M)',
    price: 1200,
    costPrice: 600, // SENSITIVE: MUST NEVER BE LEAKED
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

  const sampleWishlist: WishlistEntity = {
    id: 'wish-1',
    userId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'wi-1',
        wishlistId: 'wish-1',
        productId: 'prod-1',
        variantId: 'var-1',
        createdAt: new Date(),
        product: {
          id: 'prod-1',
          name: 'Classic Black T-Shirt',
          slug: 'classic-black-tshirt',
          status: 'ACTIVE',
          inventoryType: 'READY_STOCK',
          thumbnailUrl: 'https://example.com/thumb.jpg',
        },
        variant: {
          id: 'var-1',
          sku: 'TSHIRT-BLK-M',
          name: 'Black T-Shirt (M)',
          price: 1200,
          compareAtPrice: 1500,
          isActive: true,
          deletedAt: null,
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findWishlistByUserId: vi.fn().mockResolvedValue(sampleWishlist),
      createWishlist: vi.fn().mockResolvedValue(sampleWishlist),
      addItem: vi.fn().mockResolvedValue(sampleWishlist.items[0]),
      findItem: vi.fn().mockResolvedValue(sampleWishlist.items[0]),
      removeItem: vi.fn().mockResolvedValue(true),
      clearWishlist: vi.fn().mockResolvedValue(undefined),
    };

    mockCartService = {
      getOrCreateCart: vi.fn().mockResolvedValue({
        cart: { id: 'cart-1', items: [] },
        newRawGuestToken: undefined,
      }),
      addItem: vi.fn().mockResolvedValue({}),
    };

    service = new WishlistService(mockRepo as IWishlistRepository, mockCartService as any);
  });

  describe('Security & DTO Hygiene', () => {
    it('strictly omits costPrice or internal costing from public wishlist response DTO', async () => {
      const res = await service.getWishlist('user-1');

      expect(res.wishlist.items[0]).toHaveProperty('price', '1200.00');
      expect((res.wishlist.items[0] as any).costPrice).toBeUndefined();
      expect(JSON.stringify(res)).not.toContain('600');
      expect(JSON.stringify(res)).not.toContain('costPrice');
    });
  });

  describe('Add to Wishlist & Idempotency', () => {
    it('rejects adding inactive or deleted product variant to wishlist', async () => {
      (prisma.productVariant.findUnique as any).mockResolvedValueOnce({
        ...mockVariant,
        isActive: false,
      });

      await expect(
        service.addItem('user-1', { variantId: 'var-1' }),
      ).rejects.toThrow('unavailable or inactive');
    });

    it('idempotently adds item without throwing duplicate errors', async () => {
      (prisma.productVariant.findUnique as any).mockResolvedValue(mockVariant);

      const res = await service.addItem('user-1', { variantId: 'var-1' });

      expect(mockRepo.addItem).toHaveBeenCalledWith({
        wishlistId: 'wish-1',
        productId: 'prod-1',
        variantId: 'var-1',
      });
      expect(res.wishlist.items).toHaveLength(1);
    });
  });

  describe('Move to Cart Flow', () => {
    it('moves item to user cart and removes from wishlist', async () => {
      const result = await service.moveToCart('user-1', 'var-1');

      expect(mockCartService.getOrCreateCart).toHaveBeenCalledWith('user-1');
      expect(mockCartService.addItem).toHaveBeenCalledWith({
        cartId: 'cart-1',
        variantId: 'var-1',
        quantity: 1,
      });
      expect(mockRepo.removeItem).toHaveBeenCalledWith('wish-1', 'var-1');
      expect(result.cartItemAdded).toBe(true);
    });

    it('throws 404 when moving an item not present in wishlist', async () => {
      (mockRepo.findItem as any).mockResolvedValueOnce(null);

      await expect(
        service.moveToCart('user-1', 'non-existent-var'),
      ).rejects.toThrow('Item was not found in your wishlist');
    });
  });
});
