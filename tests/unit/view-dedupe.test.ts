import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ViewCountDeduplicator, viewDeduplicator } from '@/utils/view-dedupe.util';
import { ProductsService } from '@/modules/products/products.service';
import type { IProductsRepository, ProductEntity } from '@/modules/products/products.types';
import type { ICategoriesRepository } from '@/modules/categories/categories.types';
import type { IAuditService } from '@/services/audit.service';
import type { StorageService } from '@/services/storage.service';

describe('View Count Deduplication & Failure Resiliency', () => {
  describe('ViewCountDeduplicator Unit Logic', () => {
    let deduplicator: ViewCountDeduplicator;

    beforeEach(() => {
      deduplicator = new ViewCountDeduplicator(15);
    });

    it('should allow first view from an IP and deduplicate subsequent calls in the window', () => {
      const ip = '192.168.1.1';
      const productId = 'prod-1';

      expect(deduplicator.shouldCountView(ip, productId)).toBe(true);
      expect(deduplicator.shouldCountView(ip, productId)).toBe(false);
      expect(deduplicator.shouldCountView(ip, productId)).toBe(false);
    });

    it('should distinguish between different IPs for the same product', () => {
      const productId = 'prod-1';

      expect(deduplicator.shouldCountView('1.1.1.1', productId)).toBe(true);
      expect(deduplicator.shouldCountView('2.2.2.2', productId)).toBe(true);
      expect(deduplicator.shouldCountView('1.1.1.1', productId)).toBe(false);
    });

    it('should distinguish between different products for the same IP', () => {
      const ip = '1.1.1.1';

      expect(deduplicator.shouldCountView(ip, 'prod-1')).toBe(true);
      expect(deduplicator.shouldCountView(ip, 'prod-2')).toBe(true);
    });

    it('should allow view after window expires', () => {
      const ip = '1.1.1.1';
      const productId = 'prod-1';

      // 50ms window
      expect(deduplicator.shouldCountView(ip, productId, 50)).toBe(true);
      expect(deduplicator.shouldCountView(ip, productId, 50)).toBe(false);

      // Advance time beyond 50ms
      const realNow = Date.now;
      try {
        Date.now = () => realNow() + 100;
        expect(deduplicator.shouldCountView(ip, productId, 50)).toBe(true);
      } finally {
        Date.now = realNow;
      }
    });

    it('should clean up expired entries', () => {
      deduplicator.shouldCountView('1.1.1.1', 'prod-1', 10);
      expect(deduplicator.size).toBe(1);

      const realNow = Date.now;
      try {
        Date.now = () => realNow() + 50;
        deduplicator.cleanup();
        expect(deduplicator.size).toBe(0);
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe('ProductsService Integration with View Deduplicator', () => {
    let mockProductsRepo: Partial<IProductsRepository>;
    let mockCategoriesRepo: Partial<ICategoriesRepository>;
    let mockAuditService: Partial<IAuditService>;
    let mockStorageService: Partial<StorageService>;
    let service: ProductsService;

    const sampleProduct: ProductEntity = {
      id: 'prod-active-1',
      name: 'Classic Oxford Shirt',
      slug: 'classic-oxford-shirt',
      description: 'A premium cotton oxford shirt',
      basePrice: '1200.00',
      status: 'ACTIVE',
      isFeatured: false,
      categoryId: 'cat-1',
      tags: [{ tag: { name: 'shirt' } }] as unknown as ProductEntity['tags'],
      seo: {},
      viewCount: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      category: {
        id: 'cat-1',
        name: 'Apparel',
        slug: 'apparel',
        isActive: true,
        deletedAt: null,
      },
      variants: [],
      images: [],
    };

    beforeEach(() => {
      viewDeduplicator.clear();
      mockProductsRepo = {
        findBySlug: vi.fn().mockResolvedValue(sampleProduct),
        incrementViewCount: vi.fn().mockResolvedValue(undefined),
      };
      mockCategoriesRepo = {};
      mockAuditService = { record: vi.fn() };
      mockStorageService = {} as StorageService;

      service = new ProductsService(
        mockProductsRepo as IProductsRepository,
        mockCategoriesRepo as ICategoriesRepository,
        mockAuditService as IAuditService,
        mockStorageService as StorageService,
      );
    });

    it('should increment view count on initial request and ignore second request from same IP', async () => {
      const clientIp = '203.0.113.195';

      await service.getPublicProductBySlug('classic-oxford-shirt', clientIp);
      expect(mockProductsRepo.incrementViewCount).toHaveBeenCalledTimes(1);
      expect(mockProductsRepo.incrementViewCount).toHaveBeenCalledWith('prod-active-1');

      // Second request from same IP within window
      await service.getPublicProductBySlug('classic-oxford-shirt', clientIp);
      expect(mockProductsRepo.incrementViewCount).toHaveBeenCalledTimes(1);

      // Third request from different IP
      await service.getPublicProductBySlug('classic-oxford-shirt', '198.51.100.44');
      expect(mockProductsRepo.incrementViewCount).toHaveBeenCalledTimes(2);
    });

    it('should NOT fail the public response if incrementViewCount rejects/fails', async () => {
      vi.mocked(mockProductsRepo.incrementViewCount!).mockRejectedValue(
        new Error('Database lock error during increment'),
      );

      // Must resolve smoothly without throwing
      const res = await service.getPublicProductBySlug('classic-oxford-shirt', '203.0.113.1');
      expect(res).toBeDefined();
      expect(res.slug).toBe('classic-oxford-shirt');
    });
  });
});
