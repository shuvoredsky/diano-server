import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductsService } from '@/modules/products/products.service';
import {
  createProductSchema,
  updateProductSchema,
  variantInputSchema,
} from '@/modules/products/products.validation';
import type {
  CreateProductDto,
  IProductsRepository,
  ProductEntity,
  ProductVariantEntity,
} from '@/modules/products/products.types';
import type {
  CategoryEntity,
  CategoryTreeItem,
  ICategoriesRepository,
} from '@/modules/categories/categories.types';
import type { CategoriesService } from '@/modules/categories/categories.service';
import type { StorageService } from '@/services/storage.service';

describe('Milestone M5b - Part E: Admin Product Form Support & Security', () => {
  let mockRepo: Partial<IProductsRepository>;
  let mockCategoriesRepo: Partial<ICategoriesRepository>;
  let mockCategoriesSvc: Partial<CategoriesService>;
  let mockAuditSvc: { record: ReturnType<typeof vi.fn> };
  let mockStorageSvc: Partial<StorageService>;
  let service: ProductsService;

  const sampleRootCategory: CategoryEntity = {
    id: 'cat-fashion',
    name: 'Fashion & Apparel',
    slug: 'fashion-apparel',
    description: 'All fashion items',
    image: null,
    parentId: null,
    specificationTemplate: [
      {
        key: 'Fabric',
        label: 'Fabric Type',
        type: 'text',
        required: true,
        sortOrder: 1,
      },
    ],
    isFeatured: true,
    isActive: true,
    sortOrder: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleSubcategory: CategoryEntity = {
    id: 'cat-men-shirts',
    name: "Men's Formal Shirts",
    slug: 'mens-formal-shirts',
    description: 'Formal shirts for men',
    image: null,
    parentId: 'cat-fashion', // Child of cat-fashion
    specificationTemplate: [
      {
        key: 'Collar',
        label: 'Collar Style',
        type: 'select',
        required: false,
        options: ['Spread', 'Button-Down', 'Mandarin'],
        sortOrder: 2,
      },
    ],
    isFeatured: false,
    isActive: true,
    sortOrder: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleUnrelatedSubcategory: CategoryEntity = {
    id: 'cat-electronics-phones',
    name: 'Smartphones',
    slug: 'smartphones',
    description: 'Phones',
    image: null,
    parentId: 'cat-electronics', // NOT child of cat-fashion!
    specificationTemplate: [],
    isFeatured: false,
    isActive: true,
    sortOrder: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleVariant: ProductVariantEntity = {
    id: 'var-1',
    productId: 'prod-1',
    name: 'White / 40',
    sku: 'SHIRT-WHT-40',
    barcode: null,
    price: '2200.00',
    compareAtPrice: '2500.00',
    costPrice: '1400.00',
    attributes: { color: 'White', size: '40' },
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleProduct: ProductEntity = {
    id: 'prod-1',
    name: 'Premium Oxford White Shirt',
    slug: 'premium-oxford-white-shirt',
    description: '<p>Tailored formal shirt made from pure Egyptian cotton.</p>',
    shortDescription: 'Formal cotton shirt',
    categoryId: 'cat-men-shirts',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    freeShipping: true,
    inventoryType: 'READY_STOCK',
    specifications: {
      Fabric: 'Egyptian Cotton',
      Collar: 'Spread',
    },
    discountType: 'PERCENTAGE',
    discountValue: '15.00',
    specialOffer: true,
    mrp: '2500.00',
    status: 'ACTIVE',
    isFeatured: true,
    metaTitle: 'Formal White Shirt',
    metaDescription: 'Classic formal shirt',
    metaKeywords: 'shirt, formal, white',
    viewCount: 42,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: sampleSubcategory,
    variants: [sampleVariant],
    images: [],
    tags: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findById: vi.fn().mockResolvedValue(sampleProduct),
      findBySlug: vi.fn().mockResolvedValue(null),
      findBySku: vi.fn().mockResolvedValue(null),
      findByBarcode: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((dto) =>
        Promise.resolve({
          ...sampleProduct,
          ...dto,
          id: 'prod-created-1',
          variants: [sampleVariant],
        }),
      ),
      update: vi.fn().mockImplementation((id, dto) =>
        Promise.resolve({
          ...sampleProduct,
          ...dto,
          id,
          variants: [sampleVariant],
        }),
      ),
    };

    mockCategoriesRepo = {
      findById: vi.fn().mockImplementation((id) => {
        if (id === 'cat-fashion') return Promise.resolve(sampleRootCategory);
        if (id === 'cat-men-shirts') return Promise.resolve(sampleSubcategory);
        if (id === 'cat-electronics-phones') return Promise.resolve(sampleUnrelatedSubcategory);
        return Promise.resolve(null);
      }),
    };

    mockCategoriesSvc = {
      getPublicCategoriesTree: vi.fn().mockResolvedValue([
        {
          id: 'cat-fashion',
          name: 'Fashion & Apparel',
          slug: 'fashion-apparel',
          description: 'All fashion items',
          image: null,
          parentId: null,
          depth: 1,
          isFeatured: true,
          isActive: true,
          sortOrder: 0,
          children: [
            {
              id: 'cat-men-shirts',
              name: "Men's Formal Shirts",
              slug: 'mens-formal-shirts',
              description: 'Formal shirts for men',
              image: null,
              parentId: 'cat-fashion',
              depth: 2,
              isFeatured: false,
              isActive: true,
              sortOrder: 1,
              children: [],
            },
          ],
        } as CategoryTreeItem,
      ]),
      getProductFormSchema: vi.fn().mockImplementation((catId) => {
        if (catId === 'cat-men-shirts' || catId === 'cat-fashion') {
          return Promise.resolve({
            categoryId: catId,
            categoryName: 'Apparel',
            template: [
              { key: 'Fabric', label: 'Fabric Type', type: 'text', required: true, sortOrder: 1 },
              { key: 'Collar', label: 'Collar Style', type: 'select', required: false, options: ['Spread', 'Button-Down'], sortOrder: 2 },
            ],
          });
        }
        return Promise.resolve({
          categoryId: catId,
          categoryName: 'Other',
          template: [],
        });
      }),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageSvc = {
      uploadImage: vi.fn(),
      deleteImage: vi.fn(),
    };

    service = new ProductsService(
      mockRepo as IProductsRepository,
      mockCategoriesRepo as ICategoriesRepository,
      mockAuditSvc,
      mockStorageSvc as StorageService,
      mockCategoriesSvc as CategoriesService,
    );
  });

  describe('1. GET /api/v1/products/admin/form-options Data Contract', () => {
    it('should return complete form configuration including categories, options, and limits', async () => {
      const options = await service.getAdminFormOptions();

      expect(options).toHaveProperty('categories');
      expect(Array.isArray(options.categories)).toBe(true);

      expect(options).toHaveProperty('inventoryTypes');
      expect(options.inventoryTypes).toEqual([
        { value: 'READY_STOCK', label: 'Ready Stock' },
        { value: 'PRE_ORDER', label: 'Pre-Order' },
        { value: 'MADE_TO_ORDER', label: 'Made to Order' },
      ]);

      expect(options).toHaveProperty('discountTypes');
      expect(options.discountTypes).toEqual([
        { value: 'NONE', label: 'No Discount' },
        { value: 'PERCENTAGE', label: 'Percentage (%)' },
        { value: 'FIXED', label: 'Fixed Amount (BDT)' },
      ]);

      expect(options).toHaveProperty('uploadLimits');
      const limits = options.uploadLimits as Record<string, unknown>;
      expect(limits.maxImageSizeMb).toBe(2);
      expect(limits.galleryMax).toBe(4);
      expect(limits.slots).toEqual(['THUMBNAIL', 'BACKVIEW', 'GALLERY']);

      expect(options).toHaveProperty('videoHostAllowlist');
      expect(options.videoHostAllowlist).toEqual(['youtube.com', 'youtu.be', 'vimeo.com']);

      expect(options).toHaveProperty('specificationTemplateEndpointHint');
      expect(options.specificationTemplateEndpointHint).toBe(
        '/api/v1/categories/:id/product-form-schema',
      );
    });
  });

  describe('2. Strict Zod Validation (Rejects Unknown Keys)', () => {
    it('should reject createProduct payload with unknown/unauthorized properties', () => {
      const payloadWithHackerField = {
        name: 'Valid Name Here',
        description: '<p>A valid description of the item</p>',
        categoryId: 'cat-123',
        mrp: 1200,
        variants: [
          {
            name: 'Standard',
            sku: 'SKU-001',
            price: 1000,
          },
        ],
        hackerProperty: 'injected_data', // Unknown key
      };

      const result = createProductSchema.safeParse(payloadWithHackerField);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/unrecognized/i);
      }
    });

    it('should reject variant input with unknown properties', () => {
      const variantWithExtra = {
        name: 'Size M',
        sku: 'SKU-M-01',
        price: 500,
        fakeDatabaseColumn: 'drop tables',
      };

      const result = variantInputSchema.safeParse(variantWithExtra);
      expect(result.success).toBe(false);
    });

    it('should reject updateProduct payload with unknown properties', () => {
      const updateWithExtra = {
        name: 'New Name',
        unknownCustomField: 12345,
      };

      const result = updateProductSchema.safeParse(updateWithExtra);
      expect(result.success).toBe(false);
    });
  });

  describe('3. Subcategory Hierarchy Enforcement', () => {
    it('should reject product creation if subcategory is not a child of categoryId', async () => {
      const input: CreateProductDto = {
        name: 'Formal Shirt',
        description: '<p>High quality formal shirt</p>',
        categoryId: 'cat-fashion',
        subcategoryId: 'cat-electronics-phones', // Unrelated subcategory!
        variants: [
          {
            name: 'Standard',
            sku: 'SHIRT-STD-01',
            price: 1500,
          },
        ],
      };

      await expect(service.createProduct(input)).rejects.toThrow(
        'Subcategory must be a child of the specified category',
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('should set categoryId to leaf subcategory when hierarchy is valid', async () => {
      const input: CreateProductDto = {
        name: 'Formal White Shirt',
        description: '<p>High quality formal shirt</p>',
        categoryId: 'cat-fashion',
        subcategoryId: 'cat-men-shirts', // Valid child of cat-fashion
        specifications: {
          Fabric: 'Cotton',
        },
        variants: [
          {
            name: 'M',
            sku: 'SHIRT-M-01',
            price: 1800,
          },
        ],
      };

      const result = await service.createProduct(input);
      expect(result).toBeDefined();
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: 'cat-men-shirts', // Stored under leaf category
        }),
      );
    });
  });

  describe('4. Specification Validation against Category Template', () => {
    it('should reject product creation with unknown specification keys', async () => {
      const input: CreateProductDto = {
        name: 'Formal Shirt',
        description: '<p>High quality formal shirt</p>',
        categoryId: 'cat-men-shirts',
        specifications: {
          Fabric: 'Cotton',
          BatteryCapacity: '5000mAh', // Unknown key for apparel!
        },
        variants: [
          {
            name: 'M',
            sku: 'SHIRT-M-02',
            price: 1800,
          },
        ],
      };

      await expect(service.createProduct(input)).rejects.toThrow(
        /Unknown specification key:.*BatteryCapacity/,
      );
    });

    it('should reject product creation when required specification is missing', async () => {
      const input: CreateProductDto = {
        name: 'Formal Shirt',
        description: '<p>High quality formal shirt</p>',
        categoryId: 'cat-men-shirts',
        specifications: {
          Collar: 'Spread', // Fabric is required, but omitted!
        },
        variants: [
          {
            name: 'M',
            sku: 'SHIRT-M-03',
            price: 1800,
          },
        ],
      };

      await expect(service.createProduct(input)).rejects.toThrow(
        /Missing required specification:.*Fabric/,
      );
    });
  });

  describe('5. Rich-Text Description Sanitization (XSS Stripping)', () => {
    it('should strip malicious script tags and inline event handlers from product description', async () => {
      const dirtyHtml = `
        <p>This is a great product</p>
        <script>alert("XSS")</script>
        <a href="javascript:stealCookie()">Click here</a>
        <button onclick="harmful()">Click Me</button>
      `;

      const input: CreateProductDto = {
        name: 'Sanitized Product',
        description: dirtyHtml,
        categoryId: 'cat-fashion',
        specifications: { Fabric: 'Linen' },
        variants: [
          {
            name: 'M',
            sku: 'SANITIZED-M-01',
            price: 1200,
          },
        ],
      };

      await service.createProduct(input);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.not.stringContaining('<script>'),
        }),
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.not.stringContaining('javascript:'),
        }),
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.not.stringContaining('onclick'),
        }),
      );
    });
  });

  describe('6. Public vs Admin DTO Security', () => {
    it('should NEVER expose costPrice or internal audit fields in PublicProductDto', () => {
      const publicDto = service.formatPublicProduct(sampleProduct);

      // Verify PublicProductDto top-level
      expect(publicDto).not.toHaveProperty('costPrice');
      expect(publicDto).not.toHaveProperty('status');
      expect(publicDto).not.toHaveProperty('deletedAt');
      expect(publicDto).not.toHaveProperty('viewCount');

      // Verify variant-level
      for (const v of publicDto.variants) {
        expect(v).not.toHaveProperty('costPrice');
        expect(v).not.toHaveProperty('deletedAt');
      }
    });

    it('should include pricing calculation breakdown in AdminProductDto', () => {
      const adminDto = service.formatAdminProduct(sampleProduct, true);

      expect(adminDto).toHaveProperty('pricing');
      expect(adminDto.pricing).toBeDefined();
      expect(adminDto.pricing?.mrp).toBe('2500.00');
      expect(adminDto.pricing?.discountType).toBe('PERCENTAGE');
      expect(adminDto.pricing?.discountValue).toBe('15.00');
      expect(adminDto.pricing?.discountAmount).toBe('375.00');
      expect(adminDto.pricing?.sellingPrice).toBe('2125.00');
    });

    it('should only include costPrice in AdminVariantDto if operator has product:view_cost permission', () => {
      // Operator with permission
      const withPermission = service.formatAdminProduct(sampleProduct, true);
      expect(withPermission.variants[0]?.costPrice).toBe('1400.00');

      // Operator without permission
      const withoutPermission = service.formatAdminProduct(sampleProduct, false);
      expect(withoutPermission.variants[0]?.costPrice).toBeUndefined();
    });
  });
});
