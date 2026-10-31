import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductsService } from '@/modules/products/products.service';
import type {
  CreateProductDto,
  IProductsRepository,
  ProductEntity,
  ProductVariantEntity,
} from '@/modules/products/products.types';
import type {
  CategoryEntity,
  ICategoriesRepository,
} from '@/modules/categories/categories.types';
import type { IAuditService } from '@/services/audit.service';
import type { AccessTokenPayload } from '@/utils/jwt.util';

describe('ProductsService (Unit Tests with Mocked Repository)', () => {
  let mockProductsRepo: Partial<IProductsRepository>;
  let mockCategoriesRepo: Partial<ICategoriesRepository>;
  let mockAuditSvc: { record: ReturnType<typeof vi.fn> };
  let service: ProductsService;

  const mockAdminActor: AccessTokenPayload = {
    userId: 'admin-1',
    sessionId: 'sess-1',
    roles: ['super-admin'],
    email: 'admin@diano.com',
  };

  const sampleVariant: ProductVariantEntity = {
    id: 'var-1',
    productId: 'prod-1',
    name: 'Red / L',
    sku: 'TSHIRT-RED-L',
    barcode: '8901234567890',
    price: '1250.00',
    compareAtPrice: '1500.00',
    costPrice: '750.00',
    attributes: { color: 'Red', size: 'L' },
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleProduct: ProductEntity = {
    id: 'prod-1',
    name: 'Cotton Crewneck T-Shirt',
    slug: 'cotton-crewneck-t-shirt',
    description: '100% combed premium cotton t-shirt for daily wear',
    shortDescription: 'Premium cotton tee',
    categoryId: 'cat-shirts',
    status: 'ACTIVE',
    isFeatured: true,
    metaTitle: 'Men Cotton Crewneck T-Shirt - DIANO',
    metaDescription: 'Shop our premium cotton t-shirts in Bangladesh',
    metaKeywords: 'tshirt, cotton, men',
    viewCount: 42,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: {
      id: 'cat-shirts',
      name: 'Shirts',
      slug: 'shirts',
      isActive: true,
      deletedAt: null,
    },
    variants: [sampleVariant],
    images: [
      {
        id: 'img-1',
        productId: 'prod-1',
        variantId: 'var-1',
        url: 'https://cdn.diano.com/img-1.webp',
        altText: 'Front view',
        isPrimary: true,
        sortOrder: 0,
        createdAt: new Date(),
      },
    ],
    tags: [{ tag: { id: 'tag-1', name: 'Summer', slug: 'summer' } }],
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockProductsRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findBySku: vi.fn().mockResolvedValue(null),
      findByBarcode: vi.fn().mockResolvedValue(null),
      findProducts: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      updateStatus: vi.fn(),
      toggleFeatured: vi.fn(),
      incrementViewCount: vi.fn().mockResolvedValue(undefined),
      createVariant: vi.fn(),
      updateVariant: vi.fn(),
      softDeleteVariant: vi.fn(),
      findVariantById: vi.fn(),
      hasStockOrOrders: vi.fn().mockResolvedValue(false),
      setRelatedProducts: vi.fn().mockResolvedValue(undefined),
      findRelatedProducts: vi.fn().mockResolvedValue([]),
    };

    mockCategoriesRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'cat-shirts',
        name: 'Shirts',
        slug: 'shirts',
        isActive: true,
        deletedAt: null,
      } as unknown as CategoryEntity),
      getDescendantIds: vi.fn().mockResolvedValue([]),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new ProductsService(
      mockProductsRepo as IProductsRepository,
      mockCategoriesRepo as ICategoriesRepository,
      mockAuditSvc as unknown as IAuditService,
    );
  });

  describe('createProduct', () => {
    const validDto: CreateProductDto = {
      name: 'Linen Casual Shirt',
      description: 'Breathable linen summer casual shirt',
      categoryId: 'cat-shirts',
      variants: [
        {
          name: 'Blue / M',
          sku: 'LINEN-BLU-M',
          price: 1850,
          compareAtPrice: 2200,
          costPrice: 1100,
        },
      ],
    };

    it('should create product with variants and auto-generated unique slug', async () => {
      vi.spyOn(mockProductsRepo, 'findBySlug').mockResolvedValue(null);
      vi.spyOn(mockProductsRepo, 'create').mockImplementation(async data => ({
        ...sampleProduct,
        id: 'new-p1',
        name: data.name,
        slug: data.slug,
      }));

      const result = await service.createProduct(validDto, mockAdminActor);

      expect(mockProductsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'linen-casual-shirt',
        }),
      );
      expect(result.slug).toBe('linen-casual-shirt');
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRODUCT_CREATED' }),
      );
    });

    it('should reject creation if category does not exist', async () => {
      vi.spyOn(mockCategoriesRepo, 'findById').mockResolvedValue(null);

      await expect(service.createProduct(validDto, mockAdminActor)).rejects.toThrow(
        'Category not found',
      );
    });

    it('should reject creation if payload contains duplicate SKUs', async () => {
      const dtoWithDupSku: CreateProductDto = {
        ...validDto,
        variants: [
          { name: 'Var 1', sku: 'SAME-SKU', price: 100 },
          { name: 'Var 2', sku: 'same-sku', price: 100 },
        ],
      };

      await expect(service.createProduct(dtoWithDupSku, mockAdminActor)).rejects.toThrow(
        'Duplicate SKU in input: same-sku',
      );
    });

    it('should reject creation if SKU already exists in database', async () => {
      vi.spyOn(mockProductsRepo, 'findBySku').mockResolvedValue(sampleVariant);

      await expect(service.createProduct(validDto, mockAdminActor)).rejects.toThrow(
        "SKU 'LINEN-BLU-M' is already in use by another variant",
      );
    });

    it('should reject creation if barcode already exists in database', async () => {
      vi.spyOn(mockProductsRepo, 'findByBarcode').mockResolvedValue(sampleVariant);

      const dtoWithBarcode: CreateProductDto = {
        ...validDto,
        variants: [
          {
            name: 'Var 1',
            sku: 'UNIQUE-SKU-99',
            barcode: '8901234567890',
            price: 500,
          },
        ],
      };

      await expect(service.createProduct(dtoWithBarcode, mockAdminActor)).rejects.toThrow(
        "Barcode '8901234567890' is already in use",
      );
    });
  });

  describe('DTO Visibility & costPrice Protection', () => {
    it('CRITICAL: PublicProductDto must NEVER expose costPrice, viewCount, or internal fields', () => {
      const publicDto = service.formatPublicProduct(sampleProduct);

      expect(publicDto).not.toHaveProperty('viewCount');
      expect(publicDto).not.toHaveProperty('status');
      expect(publicDto).not.toHaveProperty('deletedAt');

      // Verify all variants in public DTO do not have costPrice
      for (const v of publicDto.variants) {
        expect(v).not.toHaveProperty('costPrice');
        expect(typeof v.price).toBe('string');
        expect(v.price).toBe('1250.00');
      }
    });

    it('AdminProductDto should omit costPrice if canViewCost is false', () => {
      const adminDtoWithoutCost = service.formatAdminProduct(sampleProduct, false);

      expect(adminDtoWithoutCost.variants[0]?.costPrice).toBeUndefined();
    });

    it('AdminProductDto should include costPrice only if canViewCost is true', () => {
      const adminDtoWithCost = service.formatAdminProduct(sampleProduct, true);

      expect(adminDtoWithCost.variants[0]?.costPrice).toBe('750.00');
    });
  });

  describe('Variant Management & Protection', () => {
    it('should log price changes to AuditLog when updating variant pricing', async () => {
      vi.spyOn(mockProductsRepo, 'findVariantById').mockResolvedValue(sampleVariant);
      vi.spyOn(mockProductsRepo, 'updateVariant').mockResolvedValue({
        ...sampleVariant,
        price: '1400.00',
      });

      await service.updateVariant('var-1', { price: 1400 }, mockAdminActor);

      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRICE_CHANGED',
          targetType: 'PRODUCT_VARIANT',
          targetId: 'var-1',
          metadata: expect.objectContaining({
            after: expect.objectContaining({ price: '1400.00' }),
          }),
        }),
      );
    });

    it('should block variant deletion if variant has active stock or historical orders', async () => {
      vi.spyOn(mockProductsRepo, 'findVariantById').mockResolvedValue(sampleVariant);
      vi.spyOn(mockProductsRepo, 'hasStockOrOrders').mockResolvedValue(true);

      await expect(service.deleteVariant('var-1', mockAdminActor)).rejects.toThrow(
        'Cannot delete variant with existing stock or historical order records',
      );
    });

    it('should allow variant soft-delete when no stock or orders exist', async () => {
      vi.spyOn(mockProductsRepo, 'findVariantById').mockResolvedValue(sampleVariant);
      vi.spyOn(mockProductsRepo, 'hasStockOrOrders').mockResolvedValue(false);
      vi.spyOn(mockProductsRepo, 'softDeleteVariant').mockResolvedValue({
        ...sampleVariant,
        deletedAt: new Date(),
        isActive: false,
      });

      const res = await service.deleteVariant('var-1', mockAdminActor);

      expect(mockProductsRepo.softDeleteVariant).toHaveBeenCalledWith('var-1');
      expect(res.deletedAt).toBeDefined();
    });
  });

  describe('Public Catalog & Category Inheritance', () => {
    it('should include all descendant category IDs when filtering products by category', async () => {
      vi.spyOn(mockCategoriesRepo, 'getDescendantIds').mockResolvedValue([
        'cat-sub-1',
        'cat-sub-2',
      ]);
      vi.spyOn(mockProductsRepo, 'findProducts').mockResolvedValue({
        items: [sampleProduct],
        total: 1,
      });

      await service.getPublicProducts({ categoryId: 'cat-parent' });

      expect(mockProductsRepo.findProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: ['cat-parent', 'cat-sub-1', 'cat-sub-2'],
        }),
        true, // onlyActiveAndPublic
      );
    });

    it('should throw 404 for public product by slug if status is not ACTIVE', async () => {
      vi.spyOn(mockProductsRepo, 'findBySlug').mockResolvedValue({
        ...sampleProduct,
        status: 'DRAFT',
      });

      await expect(service.getPublicProductBySlug('draft-product')).rejects.toThrow(
        'Product not found',
      );
    });

    it('should throw 404 for public product by slug if parent category is inactive', async () => {
      vi.spyOn(mockProductsRepo, 'findBySlug').mockResolvedValue({
        ...sampleProduct,
        category: {
          id: 'cat-1',
          name: 'Inactive Cat',
          slug: 'inactive-cat',
          isActive: false, // Category is disabled!
          deletedAt: null,
        },
      });

      await expect(service.getPublicProductBySlug('some-product')).rejects.toThrow(
        'Product not found',
      );
    });
  });
});
