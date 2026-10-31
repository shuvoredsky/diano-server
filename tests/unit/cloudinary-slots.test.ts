import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductsService } from '@/modules/products/products.service';
import type {
  IProductsRepository,
  ProductEntity,
  ProductImageEntity,
} from '@/modules/products/products.types';
import type {
  CategoryEntity,
  ICategoriesRepository,
} from '@/modules/categories/categories.types';
import type { StorageService } from '@/services/storage.service';
import { CloudinaryAdapter, validateImageSignature } from '@/services/storage.service';
import { validateAndNormalizeVideoUrl } from '@/utils/sanitize.util';
import { logger } from '@/utils/logger';

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Milestone M5b - Cloudinary & Slot-Based Product Image Uploads', () => {
  let mockRepo: Partial<IProductsRepository>;
  let mockCategoriesRepo: Partial<ICategoriesRepository>;
  let mockStorageSvc: Partial<StorageService>;
  let mockAuditSvc: { record: ReturnType<typeof vi.fn> };
  let service: ProductsService;

  const validPngBuffer = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e527defc0000000049454e44ae426082',
    'hex',
  );

  const sampleFile = {
    buffer: validPngBuffer,
    originalname: 'test.png',
    mimetype: 'image/png',
  };

  const sampleCategory: CategoryEntity = {
    id: 'cat-1',
    name: 'Clothing',
    slug: 'clothing',
    description: 'All apparel',
    image: null,
    parentId: null,
    specificationTemplate: [],
    isFeatured: true,
    isActive: true,
    sortOrder: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleProduct: ProductEntity = {
    id: 'prod-1',
    name: 'Premium Oxford Shirt',
    slug: 'premium-oxford-shirt',
    description: '<p>A classic tailored shirt</p>',
    shortDescription: 'Tailored shirt',
    categoryId: 'cat-1',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    freeShipping: true,
    inventoryType: 'READY_STOCK',
    specifications: {},
    discountType: 'NONE',
    discountValue: '0.00',
    specialOffer: false,
    mrp: '1500.00',
    status: 'DRAFT',
    isFeatured: false,
    metaTitle: null,
    metaDescription: null,
    metaKeywords: null,
    viewCount: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: sampleCategory,
    variants: [
      {
        id: 'var-1',
        productId: 'prod-1',
        name: 'M / Blue',
        sku: 'OXFORD-BLU-M',
        barcode: null,
        price: '1500.00',
        compareAtPrice: null,
        costPrice: '900.00',
        attributes: { size: 'M', color: 'Blue' },
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    images: [],
    tags: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findById: vi.fn().mockResolvedValue(sampleProduct),
      findImagesBySlot: vi.fn().mockResolvedValue([]),
      findImagesByProductId: vi.fn().mockResolvedValue([]),
      createImage: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          id: `img-${Date.now()}`,
          productId: data.productId,
          variantId: data.variantId ?? null,
          slot: data.slot ?? 'GALLERY',
          url: data.url,
          publicId: data.publicId ?? 'pub_123',
          width: data.width ?? 800,
          height: data.height ?? 800,
          format: data.format ?? 'png',
          bytes: data.bytes ?? 1024,
          altText: data.altText ?? null,
          isPrimary: data.isPrimary ?? false,
          sortOrder: data.sortOrder ?? 0,
          createdAt: new Date(),
        }),
      ),
      deleteImage: vi.fn().mockResolvedValue(undefined),
      unsetPrimaryImages: vi.fn().mockResolvedValue(undefined),
      reorderImages: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockImplementation((_id, status) =>
        Promise.resolve({ ...sampleProduct, status }),
      ),
      findImageById: vi.fn(),
    };

    mockCategoriesRepo = {
      findById: vi.fn().mockResolvedValue(sampleCategory),
    };

    mockStorageSvc = {
      uploadImage: vi.fn().mockResolvedValue({
        url: 'https://res.cloudinary.com/diano/image/upload/v1234/test.png',
        key: 'diano/products/prod-1/test',
        publicId: 'diano/products/prod-1/test_pub_id',
        width: 800,
        height: 800,
        format: 'png',
        bytes: 1024,
      }),
      deleteImage: vi.fn().mockResolvedValue(true),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new ProductsService(
      mockRepo as IProductsRepository,
      mockCategoriesRepo as ICategoriesRepository,
      mockAuditSvc,
      mockStorageSvc as StorageService,
    );
  });

  describe('1. Slot-Based Image Upload & Replace Behavior', () => {
    it('should upload thumbnail and replace existing thumbnail if one already exists', async () => {
      const oldThumbnail: ProductImageEntity = {
        id: 'img-old-thumb',
        productId: 'prod-1',
        variantId: null,
        slot: 'THUMBNAIL',
        url: 'https://res.cloudinary.com/diano/image/upload/old-thumb.png',
        publicId: 'diano/products/prod-1/old_thumb_id',
        width: 800,
        height: 800,
        format: 'png',
        bytes: 2048,
        altText: 'Old Thumbnail',
        isPrimary: true,
        sortOrder: 0,
        createdAt: new Date(),
      };

      mockRepo.findImagesBySlot = vi.fn().mockImplementation((_prodId, slot) => {
        if (slot === 'THUMBNAIL') return Promise.resolve([oldThumbnail]);
        return Promise.resolve([]);
      });

      const result = await service.uploadSlotImage('prod-1', 'THUMBNAIL', sampleFile);

      // Verify old thumbnail deletion
      expect(mockRepo.deleteImage).toHaveBeenCalledWith('img-old-thumb');
      expect(mockStorageSvc.deleteImage).toHaveBeenCalledWith('diano/products/prod-1/old_thumb_id');

      // Verify new thumbnail creation
      expect(mockRepo.unsetPrimaryImages).toHaveBeenCalledWith('prod-1');
      expect(mockRepo.createImage).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          slot: 'THUMBNAIL',
          isPrimary: true,
        }),
      );
      expect(result.slot).toBe('THUMBNAIL');
      expect(result.isPrimary).toBe(true);
    });

    it('should upload backview and replace existing backview if one already exists', async () => {
      const oldBackview: ProductImageEntity = {
        id: 'img-old-back',
        productId: 'prod-1',
        variantId: null,
        slot: 'BACKVIEW',
        url: 'https://res.cloudinary.com/diano/image/upload/old-back.png',
        publicId: 'diano/products/prod-1/old_back_id',
        width: 800,
        height: 800,
        format: 'png',
        bytes: 2048,
        altText: 'Old Backview',
        isPrimary: false,
        sortOrder: 1,
        createdAt: new Date(),
      };

      mockRepo.findImagesBySlot = vi.fn().mockImplementation((_prodId, slot) => {
        if (slot === 'BACKVIEW') return Promise.resolve([oldBackview]);
        return Promise.resolve([]);
      });

      const result = await service.uploadSlotImage('prod-1', 'BACKVIEW', sampleFile);

      expect(mockRepo.deleteImage).toHaveBeenCalledWith('img-old-back');
      expect(mockStorageSvc.deleteImage).toHaveBeenCalledWith('diano/products/prod-1/old_back_id');
      expect(mockRepo.createImage).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          slot: 'BACKVIEW',
          isPrimary: false,
        }),
      );
      expect(result.slot).toBe('BACKVIEW');
    });
  });

  describe('2. Gallery Max 4 Limit Enforcement', () => {
    it('should reject gallery upload when product already has 4 gallery images', async () => {
      const fourGalleryImages: ProductImageEntity[] = [1, 2, 3, 4].map((n) => ({
        id: `img-gal-${n}`,
        productId: 'prod-1',
        variantId: null,
        slot: 'GALLERY',
        url: `https://res.cloudinary.com/diano/image/upload/gal-${n}.png`,
        publicId: `gal_id_${n}`,
        width: 800,
        height: 800,
        format: 'png',
        bytes: 1024,
        altText: `Gallery ${n}`,
        isPrimary: false,
        sortOrder: n - 1,
        createdAt: new Date(),
      }));

      mockRepo.findImagesBySlot = vi.fn().mockImplementation((_prodId, slot) => {
        if (slot === 'GALLERY') return Promise.resolve(fourGalleryImages);
        return Promise.resolve([]);
      });

      await expect(
        service.uploadSlotImage('prod-1', 'GALLERY', sampleFile),
      ).rejects.toThrow('Maximum 4 gallery images allowed per product');

      expect(mockStorageSvc.uploadImage).not.toHaveBeenCalled();
      expect(mockRepo.createImage).not.toHaveBeenCalled();
    });

    it('should allow gallery upload when product has fewer than 4 gallery images', async () => {
      mockRepo.findImagesBySlot = vi.fn().mockResolvedValue([]);

      const result = await service.uploadSlotImage('prod-1', 'GALLERY', sampleFile);
      expect(result.slot).toBe('GALLERY');
      expect(mockRepo.createImage).toHaveBeenCalled();
    });
  });

  describe('3. Publish Rule (Active requires thumbnail, category, variant, price)', () => {
    it('should reject publishing to ACTIVE when product has no thumbnail image', async () => {
      // No thumbnail in slot
      mockRepo.findImagesBySlot = vi.fn().mockResolvedValue([]);

      await expect(service.updateStatus('prod-1', 'ACTIVE')).rejects.toThrow(
        /Cannot publish product to ACTIVE.*thumbnail image/,
      );
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('should successfully publish to ACTIVE when all requirements are met', async () => {
      const activeThumbnail: ProductImageEntity = {
        id: 'img-thumb-1',
        productId: 'prod-1',
        variantId: null,
        slot: 'THUMBNAIL',
        url: 'https://res.cloudinary.com/thumb.png',
        publicId: 'thumb_pub_1',
        width: 800,
        height: 800,
        format: 'png',
        bytes: 1000,
        altText: 'Thumb',
        isPrimary: true,
        sortOrder: 0,
        createdAt: new Date(),
      };

      mockRepo.findImagesBySlot = vi.fn().mockImplementation((_prodId, slot) => {
        if (slot === 'THUMBNAIL') return Promise.resolve([activeThumbnail]);
        return Promise.resolve([]);
      });

      const updated = await service.updateStatus('prod-1', 'ACTIVE');
      expect(updated.status).toBe('ACTIVE');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith('prod-1', 'ACTIVE');
    });

    it('should allow saving status as DRAFT without thumbnail or variants', async () => {
      const draftProduct = await service.updateStatus('prod-1', 'DRAFT');
      expect(draftProduct.status).toBe('DRAFT');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith('prod-1', 'DRAFT');
    });
  });

  describe('4. Cloudinary Adapter Disabled Behavior (503)', () => {
    it('should throw 503 when Cloudinary credentials are not configured', async () => {
      // CloudinaryAdapter with empty credentials in test environment
      const adapter = new CloudinaryAdapter();

      // Unless env vars are set, adapter is disabled
      if (!adapter.isAvailable()) {
        await expect(
          adapter.upload({
            buffer: validPngBuffer,
            originalname: 'test.png',
            mimetype: 'image/png',
          }),
        ).rejects.toThrow(/Storage service is not configured/);
      }
    });
  });

  describe('5. Delete Failure Logs Orphan for Pending Cleanup', () => {
    it('should delete DB row and log structured warning if Cloudinary destroy fails', async () => {
      const targetImage: ProductImageEntity = {
        id: 'img-to-delete',
        productId: 'prod-1',
        variantId: null,
        slot: 'GALLERY',
        url: 'https://res.cloudinary.com/gal.png',
        publicId: 'cloudinary_orphan_pub_id',
        width: 800,
        height: 800,
        format: 'png',
        bytes: 2048,
        altText: 'Gallery Image',
        isPrimary: false,
        sortOrder: 0,
        createdAt: new Date(),
      };

      mockRepo.findImageById = vi.fn().mockResolvedValue(targetImage);
      // Simulate Cloudinary SDK network failure / destroy rejection
      mockStorageSvc.deleteImage = vi.fn().mockRejectedValue(new Error('Cloudinary API Timeout'));

      // Should not throw — admin is not blocked by transient Cloudinary errors
      await expect(service.deleteProductImage('img-to-delete')).resolves.not.toThrow();

      // DB row was deleted
      expect(mockRepo.deleteImage).toHaveBeenCalledWith('img-to-delete');

      // Structured warning logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'pendingStorageCleanup',
          publicId: 'cloudinary_orphan_pub_id',
          productId: 'prod-1',
          slot: 'GALLERY',
        }),
        expect.stringContaining('Cloudinary destroy failed'),
      );
    });
  });

  describe('6. Magic-Byte Validation (Rejects Corrupted / Disguised Files)', () => {
    it('should accept valid PNG magic-bytes', () => {
      const result = validateImageSignature(validPngBuffer);
      expect(result.isValid).toBe(true);
      expect(result.ext).toBe('png');
      expect(result.mimeType).toBe('image/png');
    });

    it('should accept valid JPEG magic-bytes', () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const result = validateImageSignature(jpegBuffer);
      expect(result.isValid).toBe(true);
      expect(result.ext).toBe('jpg');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should reject text or script disguised as image', () => {
      const textBuffer = Buffer.from('<script>alert("xss")</script>', 'utf-8');
      const result = validateImageSignature(textBuffer);
      expect(result.isValid).toBe(false);
    });

    it('should reject truncated buffer', () => {
      const emptyBuffer = Buffer.from([0x89, 0x50]);
      const result = validateImageSignature(emptyBuffer);
      expect(result.isValid).toBe(false);
    });
  });

  describe('7. Video URL Host Validation', () => {
    it('should normalize valid YouTube watch URL to embed URL', () => {
      const normalized = validateAndNormalizeVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(normalized).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should normalize youtu.be short URL to embed URL', () => {
      const normalized = validateAndNormalizeVideoUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(normalized).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should normalize Vimeo URL to player URL', () => {
      const normalized = validateAndNormalizeVideoUrl('https://vimeo.com/123456789');
      expect(normalized).toBe('https://player.vimeo.com/video/123456789');
    });

    it('should reject non-HTTPS URLs', () => {
      expect(() =>
        validateAndNormalizeVideoUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toThrow(/HTTPS/);
    });

    it('should reject unauthorized hosts', () => {
      expect(() =>
        validateAndNormalizeVideoUrl('https://evil-storage.com/malicious.mp4'),
      ).toThrow(/Unsupported video host/);
    });
  });

  describe('8. Gallery-Only Reorder Validation', () => {
    it('should reject reordering if any image is not a GALLERY slot', async () => {
      const mixedImages: ProductImageEntity[] = [
        {
          id: 'img-1',
          productId: 'prod-1',
          variantId: null,
          slot: 'THUMBNAIL',
          url: 'https://test/thumb.png',
          altText: null,
          isPrimary: true,
          sortOrder: 0,
          createdAt: new Date(),
        },
        {
          id: 'img-2',
          productId: 'prod-1',
          variantId: null,
          slot: 'GALLERY',
          url: 'https://test/gal.png',
          altText: null,
          isPrimary: false,
          sortOrder: 1,
          createdAt: new Date(),
        },
      ];

      mockRepo.findImagesByProductId = vi.fn().mockResolvedValue(mixedImages);

      await expect(
        service.reorderProductImages('prod-1', [
          { id: 'img-1', sortOrder: 1 },
          { id: 'img-2', sortOrder: 0 },
        ]),
      ).rejects.toThrow('Only gallery images can be reordered');

      expect(mockRepo.reorderImages).not.toHaveBeenCalled();
    });
  });
});
