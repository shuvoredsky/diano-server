import { AppError } from '@/utils/app-error';
import { viewDeduplicator } from '@/utils/view-dedupe.util';
import { logger } from '@/utils/logger';
import type {
  AdminProductDto,
  AdminVariantDto,
  CreateProductDto,
  CreateVariantInput,
  DiscountType,
  IProductsRepository,
  ProductEntity,
  ProductImageEntity,
  ProductImageSlot,
  ProductQueryFilter,
  ProductVariantEntity,
  PublicProductDto,
  PublicProductImageDto,
  ProductPricingDto,
  PublicVariantDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './products.types';
import { calculatePricing } from './products.pricing';
import { productsRepository as defaultProductsRepo } from './products.repository';
import type { ICategoriesRepository } from '@/modules/categories/categories.types';
import { categoriesRepository as defaultCategoriesRepo } from '@/modules/categories/categories.repository';
import {
  categoriesService as defaultCategoriesService,
  type CategoriesService,
} from '@/modules/categories/categories.service';
import { validateProductSpecifications } from '@/modules/categories/categories.specifications';
import { sanitizeDescription, validateAndNormalizeVideoUrl } from '@/utils/sanitize.util';
import { env } from '@/config/env.config';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import {
  getResponsiveImageUrls,
  storageService as defaultStorageService,
  type StorageService,
} from '@/services/storage.service';

export class ProductsService {
  constructor(
    private readonly repo: IProductsRepository = defaultProductsRepo,
    private readonly categoriesRepo: ICategoriesRepository = defaultCategoriesRepo,
    private readonly auditSvc: IAuditService = defaultAuditService,
    private readonly storageSvc: StorageService = defaultStorageService,
    private readonly categoriesSvc: CategoriesService = defaultCategoriesService,
  ) {}

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async generateUniqueSlug(baseText: string, currentId?: string): Promise<string> {
    const baseSlug = this.slugify(baseText);
    let candidateSlug = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await this.repo.findBySlug(candidateSlug);
      if (!existing || (currentId && existing.id === currentId)) {
        return candidateSlug;
      }
      candidateSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }
  }

  private formatMoney(val: unknown): string {
    if (val === null || val === undefined) return '0.00';
    const num = Number(val);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }

  private formatPricing(p: ProductEntity): ProductPricingDto | undefined {
    if (!p.mrp) return undefined;
    const calc = calculatePricing({
      mrp: p.mrp,
      discountType: (p.discountType as DiscountType) ?? 'NONE',
      discountValue: p.discountValue ?? 0,
    });
    return {
      mrp: calc.mrp.toFixed(2),
      discountType: calc.discountType,
      discountValue: calc.discountValue.toFixed(2),
      discountAmount: calc.discountAmount.toFixed(2),
      sellingPrice: calc.sellingPrice.toFixed(2),
      warnings: calc.warnings,
    };
  }

  /**
   * Format public variant DTO — Strips costPrice completely
   */
  private formatPublicVariant(v: ProductVariantEntity): PublicVariantDto {
    return {
      id: v.id,
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      price: this.formatMoney(v.price),
      compareAtPrice: v.compareAtPrice ? this.formatMoney(v.compareAtPrice) : null,
      attributes: (v.attributes as Record<string, unknown>) ?? {},
      isActive: v.isActive,
    };
  }

  /**
   * Format public product DTO — Safe from sensitive business metrics & internal cost prices
   */
  formatPublicProduct(p: ProductEntity): PublicProductDto {
    const activeVariants = (p.variants ?? [])
      .filter(v => v.isActive && !v.deletedAt)
      .map(v => this.formatPublicVariant(v));

    const pricing = this.formatPricing(p);

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      shortDescription: p.shortDescription,
      categoryId: p.categoryId,
      category: p.category
        ? {
            id: p.category.id,
            name: p.category.name,
            slug: p.category.slug,
          }
        : undefined,
      videoUrl: p.videoUrl ?? null,
      freeShipping: p.freeShipping ?? false,
      specialOffer: p.specialOffer ?? false,
      inventoryType: p.inventoryType ?? 'READY_STOCK',
      specifications: (p.specifications as Record<string, unknown>) ?? {},
      pricing,
      isFeatured: p.isFeatured,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      metaKeywords: p.metaKeywords,
      variants: activeVariants,
      images: (p.images ?? []).map(img => ({
        id: img.id,
        slot: img.slot ?? 'GALLERY',
        url: img.url,
        publicId: img.publicId ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
        format: img.format ?? null,
        bytes: img.bytes ?? null,
        responsiveUrls: getResponsiveImageUrls(img.url, img.publicId),
        altText: img.altText,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder,
        variantId: img.variantId,
      })),
      tags: (p.tags ?? []).map(t => t.tag.name),
      createdAt: p.createdAt,
    };
  }

  /**
   * Format admin product DTO — includes costPrice only if operator has product:view_cost permission
   */
  formatAdminProduct(p: ProductEntity, canViewCost = false): AdminProductDto {
    const variants: AdminVariantDto[] = (p.variants ?? []).map(v => ({
      ...this.formatPublicVariant(v),
      costPrice: canViewCost && v.costPrice ? this.formatMoney(v.costPrice) : undefined,
      deletedAt: v.deletedAt,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));

    const pricing = this.formatPricing(p);

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      shortDescription: p.shortDescription,
      categoryId: p.categoryId,
      category: p.category,
      videoUrl: p.videoUrl ?? null,
      freeShipping: p.freeShipping ?? false,
      specialOffer: p.specialOffer ?? false,
      inventoryType: p.inventoryType ?? 'READY_STOCK',
      specifications: (p.specifications as Record<string, unknown>) ?? {},
      pricing,
      status: p.status,
      isFeatured: p.isFeatured,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      metaKeywords: p.metaKeywords,
      viewCount: p.viewCount,
      deletedAt: p.deletedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      variants,
      images: (p.images ?? []).map(img => ({
        id: img.id,
        slot: img.slot ?? 'GALLERY',
        url: img.url,
        publicId: img.publicId ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
        format: img.format ?? null,
        bytes: img.bytes ?? null,
        responsiveUrls: getResponsiveImageUrls(img.url, img.publicId),
        altText: img.altText,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder,
        variantId: img.variantId,
      })),
      tags: (p.tags ?? []).map(t => t.tag.name),
      relatedProductIds: (p.relatedTo ?? []).map(r => r.relatedProduct.id),
    };
  }

  /**
   * Admin: Create product with variants in a single transaction
   */
  async createProduct(
    dto: CreateProductDto,
    actor?: AccessTokenPayload,
  ): Promise<AdminProductDto> {
    // 1. Verify category exists and is not deleted
    const category = await this.categoriesRepo.findById(dto.categoryId);
    if (!category || category.deletedAt) {
      throw AppError.notFound('Category not found');
    }

    // 1b. Validate subcategory if provided (must be child of specified category)
    let leafCategoryId = dto.categoryId;
    if (dto.subcategoryId) {
      const subcat = await this.categoriesRepo.findById(dto.subcategoryId);
      if (!subcat || subcat.deletedAt || !subcat.isActive) {
        throw AppError.badRequest('Subcategory not found or is inactive');
      }
      if (subcat.parentId !== dto.categoryId) {
        throw AppError.badRequest('Subcategory must be a child of the specified category');
      }
      leafCategoryId = dto.subcategoryId;
    }

    // 1c. Validate specifications against category/subcategory template
    if (dto.specifications && Object.keys(dto.specifications).length > 0) {
      const schema = await this.categoriesSvc.getProductFormSchema(leafCategoryId);
      validateProductSpecifications(dto.specifications, schema.template);
    }

    // 1d. Sanitize rich-text description
    if (dto.description) {
      dto.description = sanitizeDescription(dto.description);
    }

    // 1e. Validate and normalize video URL
    if (dto.videoUrl) {
      dto.videoUrl = validateAndNormalizeVideoUrl(dto.videoUrl);
    }

    // 1f. Validate pricing calculations if MRP provided
    if (dto.mrp) {
      calculatePricing({
        mrp: dto.mrp,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
      });
    }

    // 1g. Handle SEO field object
    if (dto.seo) {
      dto.metaTitle = dto.seo.metaTitle ?? dto.metaTitle;
      dto.metaDescription = dto.seo.metaDescription ?? dto.metaDescription;
      dto.metaKeywords = dto.seo.metaKeywords ?? dto.metaKeywords;
    }

    // 2. Validate SKU and Barcode uniqueness across initial variants
    const skuSet = new Set<string>();
    for (const v of dto.variants) {
      if (skuSet.has(v.sku.toLowerCase())) {
        throw AppError.badRequest(`Duplicate SKU in input: ${v.sku}`);
      }
      skuSet.add(v.sku.toLowerCase());

      const existingSku = await this.repo.findBySku(v.sku);
      if (existingSku) {
        throw AppError.badRequest(`SKU '${v.sku}' is already in use by another variant`);
      }

      if (v.barcode) {
        const existingBarcode = await this.repo.findByBarcode(v.barcode);
        if (existingBarcode) {
          throw AppError.badRequest(`Barcode '${v.barcode}' is already in use`);
        }
      }

      // Ensure variant selling price is calculated via calculatePricing if not explicitly overridden
      const variantMrp = v.compareAtPrice ?? dto.mrp;
      if (variantMrp && Number(variantMrp) > 0) {
        if (v.price === undefined || v.price === null || Number(v.price) <= 0) {
          const calc = calculatePricing({
            mrp: variantMrp,
            discountType: dto.discountType ?? 'NONE',
            discountValue: dto.discountValue ?? 0,
            costPrice: v.costPrice ? Number(v.costPrice) : undefined,
          });
          v.price = Number(calc.sellingPrice.toFixed(2));
        }
        if (!v.compareAtPrice && dto.mrp) {
          v.compareAtPrice = Number(dto.mrp);
        }
      } else if (v.price && !v.compareAtPrice) {
        v.compareAtPrice = Number(v.price);
      }
    }

    // 3. Generate unique slug
    const rawSlug = dto.slug && dto.slug.length > 0 ? dto.slug : dto.name;
    const slug = await this.generateUniqueSlug(rawSlug);

    // 4. Create in repository
    const product = await this.repo.create({
      ...dto,
      categoryId: leafCategoryId,
      slug,
    });

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_CREATED',
        targetType: 'PRODUCT',
        targetId: product.id,
        metadata: {
          name: product.name,
          slug: product.slug,
          variantsCount: dto.variants.length,
        },
      });
    }

    return this.formatAdminProduct(product, true);
  }

  /**
   * Admin: Update product details
   */
  async updateProduct(
    id: string,
    dto: UpdateProductDto,
    actor?: AccessTokenPayload,
  ): Promise<AdminProductDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Product not found');
    }

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.generateUniqueSlug(dto.slug, id);
    } else if (dto.name && dto.name !== existing.name && !dto.slug) {
      slug = await this.generateUniqueSlug(dto.name, id);
    }

    const parentCatId = dto.categoryId || existing.categoryId;
    let leafCategoryId = parentCatId;

    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      const category = await this.categoriesRepo.findById(dto.categoryId);
      if (!category || category.deletedAt) {
        throw AppError.notFound('Target category not found');
      }
    }

    if (dto.subcategoryId) {
      const subcat = await this.categoriesRepo.findById(dto.subcategoryId);
      if (!subcat || subcat.deletedAt || !subcat.isActive) {
        throw AppError.badRequest('Subcategory not found or is inactive');
      }
      if (subcat.parentId !== parentCatId) {
        throw AppError.badRequest('Subcategory must be a child of the specified category');
      }
      leafCategoryId = dto.subcategoryId;
    }

    // Validate specifications if updated
    if (dto.specifications && Object.keys(dto.specifications).length > 0) {
      const schema = await this.categoriesSvc.getProductFormSchema(leafCategoryId);
      validateProductSpecifications(dto.specifications, schema.template);
    }

    if (dto.description) {
      dto.description = sanitizeDescription(dto.description);
    }

    if (dto.videoUrl) {
      dto.videoUrl = validateAndNormalizeVideoUrl(dto.videoUrl);
    }

    if (dto.mrp !== undefined) {
      calculatePricing({
        mrp: dto.mrp ?? existing.mrp ?? 1,
        discountType: dto.discountType ?? (existing.discountType as DiscountType) ?? 'NONE',
        discountValue:
          dto.discountValue !== undefined && dto.discountValue !== null
            ? Number(dto.discountValue)
            : existing.discountValue
              ? Number(existing.discountValue)
              : 0,
      });
    }

    if (dto.seo) {
      dto.metaTitle = dto.seo.metaTitle ?? dto.metaTitle;
      dto.metaDescription = dto.seo.metaDescription ?? dto.metaDescription;
      dto.metaKeywords = dto.seo.metaKeywords ?? dto.metaKeywords;
    }

    const updated = await this.repo.update(id, {
      ...dto,
      categoryId: leafCategoryId,
      slug,
    });

    // Recompute variant selling prices if product-level pricing changed
    const pricingChanged =
      dto.mrp !== undefined || dto.discountType !== undefined || dto.discountValue !== undefined;
    if (pricingChanged && existing.variants && existing.variants.length > 0) {
      const effectiveMrp = dto.mrp !== undefined ? dto.mrp : existing.mrp;
      const effectiveDiscountType =
        (dto.discountType !== undefined ? dto.discountType : existing.discountType) as DiscountType ?? 'NONE';
      const effectiveDiscountValue =
        dto.discountValue !== undefined
          ? Number(dto.discountValue)
          : existing.discountValue
            ? Number(existing.discountValue)
            : 0;

      for (const v of existing.variants) {
        const vMrp = v.compareAtPrice ?? effectiveMrp;
        if (vMrp && Number(vMrp) > 0) {
          const calc = calculatePricing({
            mrp: vMrp,
            discountType: effectiveDiscountType,
            discountValue: effectiveDiscountValue,
            costPrice: v.costPrice ? Number(v.costPrice) : undefined,
          });
          const recomputedPrice = Number(calc.sellingPrice.toFixed(2));
          if (Number(v.price) !== recomputedPrice) {
            await this.repo.updateVariant(v.id, {
              price: recomputedPrice,
              compareAtPrice: vMrp ? Number(vMrp) : undefined,
            });
          }
        }
      }
    }

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_UPDATED',
        targetType: 'PRODUCT',
        targetId: id,
        metadata: { before: existing.name, after: updated.name },
      });
    }

    return this.formatAdminProduct(updated, true);
  }

  /**
   * Admin: Get all options, categories, and limits required to render the admin product form
   */
  async getAdminFormOptions(): Promise<Record<string, unknown>> {
    const categories = await this.categoriesSvc.getPublicCategoriesTree();

    return {
      categories,
      inventoryTypes: [
        { value: 'READY_STOCK', label: 'Ready Stock' },
        { value: 'PRE_ORDER', label: 'Pre-Order' },
        { value: 'MADE_TO_ORDER', label: 'Made to Order' },
      ],
      discountTypes: [
        { value: 'NONE', label: 'No Discount' },
        { value: 'PERCENTAGE', label: 'Percentage (%)' },
        { value: 'FIXED', label: 'Fixed Amount (BDT)' },
      ],
      uploadLimits: {
        maxImageSizeMb: env.MAX_IMAGE_SIZE_MB,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
        galleryMax: 4,
        slots: ['THUMBNAIL', 'BACKVIEW', 'GALLERY'],
      },
      requiredFields: {
        draft: ['name', 'categoryId', 'description', 'variants'],
        active: [
          'name',
          'categoryId',
          'description',
          'variants (with SKU and price > 0)',
          'thumbnail image',
          'valid price greater than 0',
        ],
      },
      videoHostAllowlist: ['youtube.com', 'youtu.be', 'vimeo.com'],
      specificationTemplateEndpointHint: '/api/v1/categories/:id/product-form-schema',
    };
  }

  /**
   * Admin: Soft-delete product
   */
  async deleteProduct(id: string, actor?: AccessTokenPayload): Promise<AdminProductDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Product not found');
    }

    const deleted = await this.repo.softDelete(id);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_DELETED',
        targetType: 'PRODUCT',
        targetId: id,
      });
    }

    return this.formatAdminProduct(deleted, true);
  }

  /**
   * Admin: Update status (DRAFT, ACTIVE, ARCHIVED)
   */
  async updateStatus(
    id: string,
    status: string,
    actor?: AccessTokenPayload,
  ): Promise<AdminProductDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Product not found');
    }

    if (status === 'ACTIVE') {
      const missingFields: string[] = [];

      // 1. Thumbnail required
      const thumbnails = await this.repo.findImagesBySlot(id, 'THUMBNAIL');
      if (!thumbnails || thumbnails.length === 0) {
        missingFields.push('thumbnail image');
      }

      // 2. Category required and active
      if (!existing.categoryId) {
        missingFields.push('category');
      } else {
        const cat = await this.categoriesRepo.findById(existing.categoryId);
        if (!cat || !cat.isActive || cat.deletedAt) {
          missingFields.push('active category');
        }
      }

      // 3. At least one active variant with SKU
      const activeVariants = (existing.variants ?? []).filter(
        v => v.isActive && !v.deletedAt && v.sku && v.sku.trim().length > 0,
      );
      if (activeVariants.length === 0) {
        missingFields.push('at least one active variant with SKU');
      }

      // 4. Valid price > 0
      const hasValidPrice =
        (existing.mrp && Number(existing.mrp) > 0) ||
        activeVariants.some(v => Number(v.price) > 0);
      if (!hasValidPrice) {
        missingFields.push('valid price greater than 0');
      }

      if (missingFields.length > 0) {
        throw AppError.badRequest(
          `Cannot publish product to ACTIVE. Missing required fields: ${missingFields.join(', ')}`,
        );
      }
    }

    const updated = await this.repo.updateStatus(id, status);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_STATUS_UPDATED',
        targetType: 'PRODUCT',
        targetId: id,
        metadata: { from: existing.status, to: status },
      });
    }

    return this.formatAdminProduct(updated, true);
  }

  /**
   * Admin: Toggle Featured Flag
   */
  async toggleFeatured(
    id: string,
    isFeatured: boolean,
    actor?: AccessTokenPayload,
  ): Promise<AdminProductDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Product not found');
    }

    const updated = await this.repo.toggleFeatured(id, isFeatured);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_FEATURED_TOGGLED',
        targetType: 'PRODUCT',
        targetId: id,
        metadata: { isFeatured },
      });
    }

    return this.formatAdminProduct(updated, true);
  }

  /**
   * Admin: Add Variant to Product
   */
  async addVariant(
    productId: string,
    dto: CreateVariantInput,
    actor?: AccessTokenPayload,
  ): Promise<AdminVariantDto> {
    const product = await this.repo.findById(productId);
    if (!product) {
      throw AppError.notFound('Product not found');
    }

    const existingSku = await this.repo.findBySku(dto.sku);
    if (existingSku) {
      throw AppError.badRequest(`SKU '${dto.sku}' is already in use`);
    }

    if (dto.barcode) {
      const existingBarcode = await this.repo.findByBarcode(dto.barcode);
      if (existingBarcode) {
        throw AppError.badRequest(`Barcode '${dto.barcode}' is already in use`);
      }
    }

    // Ensure variant selling price is calculated via calculatePricing if not explicitly specified
    const variantMrp = dto.compareAtPrice ?? product.mrp;
    if (variantMrp && Number(variantMrp) > 0) {
      if (dto.price === undefined || dto.price === null || Number(dto.price) <= 0) {
        const calc = calculatePricing({
          mrp: variantMrp,
          discountType: (product.discountType as DiscountType) ?? 'NONE',
          discountValue: product.discountValue ? Number(product.discountValue) : 0,
          costPrice: dto.costPrice ? Number(dto.costPrice) : undefined,
        });
        dto.price = Number(calc.sellingPrice.toFixed(2));
      }
      if (!dto.compareAtPrice && product.mrp) {
        dto.compareAtPrice = Number(product.mrp);
      }
    } else if (dto.price && !dto.compareAtPrice) {
      dto.compareAtPrice = Number(dto.price);
    }

    const variant = await this.repo.createVariant(productId, dto);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_VARIANT_CREATED',
        targetType: 'PRODUCT_VARIANT',
        targetId: variant.id,
        metadata: { sku: variant.sku, price: variant.price },
      });
    }

    return {
      ...this.formatPublicVariant(variant),
      costPrice: variant.costPrice ? this.formatMoney(variant.costPrice) : undefined,
      deletedAt: variant.deletedAt,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    };
  }

  /**
   * Admin: Update Variant (with price change audit logging)
   */
  async updateVariant(
    variantId: string,
    dto: UpdateVariantDto,
    actor?: AccessTokenPayload,
  ): Promise<AdminVariantDto> {
    const existing = await this.repo.findVariantById(variantId);
    if (!existing) {
      throw AppError.notFound('Variant not found');
    }

    if (dto.sku && dto.sku !== existing.sku) {
      const existingSku = await this.repo.findBySku(dto.sku);
      if (existingSku && existingSku.id !== variantId) {
        throw AppError.badRequest(`SKU '${dto.sku}' is already in use`);
      }
    }

    if (dto.barcode && dto.barcode !== existing.barcode) {
      const existingBarcode = await this.repo.findByBarcode(dto.barcode);
      if (existingBarcode && existingBarcode.id !== variantId) {
        throw AppError.badRequest(`Barcode '${dto.barcode}' is already in use`);
      }
    }

    if (
      dto.compareAtPrice !== undefined &&
      dto.compareAtPrice !== null &&
      (dto.price === undefined || dto.price === null)
    ) {
      const product = await this.repo.findById(existing.productId);
      if (product) {
        const calc = calculatePricing({
          mrp: dto.compareAtPrice,
          discountType: (product.discountType as DiscountType) ?? 'NONE',
          discountValue: product.discountValue ? Number(product.discountValue) : 0,
          costPrice:
            dto.costPrice !== undefined
              ? (dto.costPrice ?? undefined)
              : existing.costPrice !== null
                ? Number(existing.costPrice)
                : undefined,
        });
        dto.price = Number(calc.sellingPrice.toFixed(2));
      }
    }

    // Price change audit
    const isPriceChanged =
      (dto.price !== undefined && dto.price.toString() !== existing.price.toString()) ||
      (dto.compareAtPrice !== undefined &&
        dto.compareAtPrice?.toString() !== existing.compareAtPrice?.toString()) ||
      (dto.costPrice !== undefined &&
        dto.costPrice?.toString() !== existing.costPrice?.toString());

    const updated = await this.repo.updateVariant(variantId, dto);

    if (actor && isPriceChanged) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRICE_CHANGED',
        targetType: 'PRODUCT_VARIANT',
        targetId: variantId,
        metadata: {
          sku: updated.sku,
          before: {
            price: existing.price,
            compareAtPrice: existing.compareAtPrice,
            costPrice: existing.costPrice,
          },
          after: {
            price: updated.price,
            compareAtPrice: updated.compareAtPrice,
            costPrice: updated.costPrice,
          },
        },
      });
    }

    return {
      ...this.formatPublicVariant(updated),
      costPrice: updated.costPrice ? this.formatMoney(updated.costPrice) : undefined,
      deletedAt: updated.deletedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Admin: Soft-delete Variant (blocked if stock or orders exist)
   */
  async deleteVariant(
    variantId: string,
    actor?: AccessTokenPayload,
  ): Promise<AdminVariantDto> {
    const existing = await this.repo.findVariantById(variantId);
    if (!existing) {
      throw AppError.notFound('Variant not found');
    }

    // Protection check
    const hasActiveStockOrOrders = await this.repo.hasStockOrOrders(variantId);
    if (hasActiveStockOrOrders) {
      throw AppError.badRequest(
        'Cannot delete variant with existing stock or historical order records',
      );
    }

    const deleted = await this.repo.softDeleteVariant(variantId);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_VARIANT_DELETED',
        targetType: 'PRODUCT_VARIANT',
        targetId: variantId,
        metadata: { sku: existing.sku },
      });
    }

    return {
      ...this.formatPublicVariant(deleted),
      costPrice: deleted.costPrice ? this.formatMoney(deleted.costPrice) : undefined,
      deletedAt: deleted.deletedAt,
      createdAt: deleted.createdAt,
      updatedAt: deleted.updatedAt,
    };
  }

  /**
   * Admin: Get single product by ID
   */
  async getAdminProductById(id: string, canViewCost = false): Promise<AdminProductDto> {
    const product = await this.repo.findById(id, true);
    if (!product) {
      throw AppError.notFound('Product not found');
    }
    return this.formatAdminProduct(product, canViewCost);
  }

  /**
   * Admin: Get paginated products for management
   */
  async getAdminProducts(
    filter: ProductQueryFilter,
    canViewCost = false,
  ): Promise<{ items: AdminProductDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

    const result = await this.repo.findProducts(filter, false);

    return {
      items: result.items.map(p => this.formatAdminProduct(p, canViewCost)),
      total: result.total,
      page,
      limit,
    };
  }

  /**
   * Public: Get paginated catalog products (only ACTIVE in active categories)
   */
  async getPublicProducts(
    filter: ProductQueryFilter,
  ): Promise<{ items: PublicProductDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

    // If categoryId is filtered, expand to include all descendant categories
    let categoryIds: string[] | undefined = undefined;
    if (filter.categoryId) {
      const descendants = await this.categoriesRepo.getDescendantIds(filter.categoryId);
      categoryIds = [filter.categoryId, ...descendants];
    }

    const result = await this.repo.findProducts(
      {
        ...filter,
        categoryIds,
        page,
        limit,
      },
      true, // onlyActiveAndPublic
    );

    return {
      items: result.items.map(p => this.formatPublicProduct(p)),
      total: result.total,
      page,
      limit,
    };
  }

  /**
   * Public: Get product by slug (only ACTIVE in active categories)
   */
  async getPublicProductBySlug(slug: string, clientIp?: string): Promise<PublicProductDto> {
    const product = await this.repo.findBySlug(slug);
    if (!product || product.status !== 'ACTIVE' || product.deletedAt) {
      throw AppError.notFound('Product not found');
    }

    // Verify parent category is active
    if (product.category && (!product.category.isActive || product.category.deletedAt)) {
      throw AppError.notFound('Product not found');
    }

    // Increment view count asynchronously with IP deduplication
    if (clientIp) {
      try {
        if (viewDeduplicator.shouldCountView(clientIp, product.id)) {
          this.repo.incrementViewCount(product.id).catch((err) => {
            logger.warn({ err, productId: product.id }, 'Async view count increment failed');
          });
        }
      } catch (err) {
        logger.warn({ err, productId: product.id }, 'View deduplication check failed');
      }
    }

    return this.formatPublicProduct(product);
  }

  /**
   * Public: Get related products
   */
  async getPublicRelatedProducts(slug: string): Promise<PublicProductDto[]> {
    const product = await this.repo.findBySlug(slug);
    if (!product || product.status !== 'ACTIVE' || product.deletedAt) {
      throw AppError.notFound('Product not found');
    }

    const related = await this.repo.findRelatedProducts(product.id);
    return related.map(p => this.formatPublicProduct(p));
  }

  /**
   * Public: Get featured products
   */
  async getPublicFeaturedProducts(limit = 10): Promise<PublicProductDto[]> {
    const result = await this.repo.findProducts(
      {
        isFeatured: true,
        limit,
        page: 1,
      },
      true,
    );

    return result.items.map(p => this.formatPublicProduct(p));
  }

  /**
   * Admin: Upload images for a product or variant gallery
   */
  async uploadProductImages(
    productId: string,
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
    options: { variantId?: string; isPrimary?: boolean; altText?: string } = {},
    actor?: AccessTokenPayload,
  ): Promise<ProductImageEntity[]> {
    const product = await this.repo.findById(productId);
    if (!product) {
      throw AppError.notFound('Product not found');
    }

    if (options.variantId) {
      const variant = await this.repo.findVariantById(options.variantId);
      if (!variant || variant.productId !== productId) {
        throw AppError.notFound('Target variant not found on this product');
      }
    }

    if (options.isPrimary) {
      await this.repo.unsetPrimaryImages(productId);
    }

    const createdImages: ProductImageEntity[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const uploadResult = await this.storageSvc.uploadImage(file, 'products');

      const isPrimaryForFile = options.isPrimary && i === 0;
      const img = await this.repo.createImage({
        productId,
        variantId: options.variantId ?? null,
        url: uploadResult.url,
        altText: options.altText ?? product.name,
        isPrimary: isPrimaryForFile ?? false,
        sortOrder: i,
      });
      createdImages.push(img);
    }

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_IMAGES_UPLOADED',
        targetType: 'PRODUCT',
        targetId: productId,
        metadata: { count: createdImages.length },
      });
    }

    return createdImages;
  }

  /**
   * Admin: Update product image metadata
   */
  async updateProductImage(
    imageId: string,
    data: { altText?: string; isPrimary?: boolean; sortOrder?: number },
    actor?: AccessTokenPayload,
  ): Promise<ProductImageEntity> {
    const image = await this.repo.findImageById(imageId);
    if (!image) {
      throw AppError.notFound('Product image not found');
    }

    if (data.isPrimary) {
      await this.repo.unsetPrimaryImages(image.productId);
    }

    const updated = await this.repo.updateImage(imageId, data);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_IMAGE_UPDATED',
        targetType: 'PRODUCT_IMAGE',
        targetId: imageId,
      });
    }

    return updated;
  }

  /**
   * Admin: Upload slot-based product image (THUMBNAIL, BACKVIEW, GALLERY)
   * - THUMBNAIL: Replaces existing thumbnail (destroys old from storage, deletes old DB row)
   * - BACKVIEW: Replaces existing backview (destroys old from storage, deletes old DB row)
   * - GALLERY: Enforces maximum 4 total images limit
   */
  async uploadSlotImage(
    productId: string,
    slot: ProductImageSlot,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    actor?: AccessTokenPayload,
  ): Promise<PublicProductImageDto> {
    const product = await this.repo.findById(productId);
    if (!product) {
      throw AppError.notFound('Product not found');
    }

    if (slot === 'THUMBNAIL') {
      const existing = await this.repo.findImagesBySlot(productId, 'THUMBNAIL');
      for (const old of existing) {
        await this.repo.deleteImage(old.id);
        const storageKey =
          old.publicId ||
          (old.url.startsWith('/uploads/') ? old.url.replace('/uploads/', '') : old.url);
        try {
          await this.storageSvc.deleteImage(storageKey);
        } catch (err) {
          logger.warn(
            { event: 'pendingStorageCleanup', publicId: old.publicId, productId, slot: 'THUMBNAIL', err },
            'Previous thumbnail storage cleanup failed',
          );
        }
      }
    } else if (slot === 'BACKVIEW') {
      const existing = await this.repo.findImagesBySlot(productId, 'BACKVIEW');
      for (const old of existing) {
        await this.repo.deleteImage(old.id);
        const storageKey =
          old.publicId ||
          (old.url.startsWith('/uploads/') ? old.url.replace('/uploads/', '') : old.url);
        try {
          await this.storageSvc.deleteImage(storageKey);
        } catch (err) {
          logger.warn(
            { event: 'pendingStorageCleanup', publicId: old.publicId, productId, slot: 'BACKVIEW', err },
            'Previous backview storage cleanup failed',
          );
        }
      }
    } else if (slot === 'GALLERY') {
      const existing = await this.repo.findImagesBySlot(productId, 'GALLERY');
      if (existing.length >= 4) {
        throw AppError.badRequest('Maximum 4 gallery images allowed per product');
      }
    }

    const folder = `diano/products/${productId}/${slot.toLowerCase()}`;
    const uploadResult = await this.storageSvc.uploadImage(file, folder);

    const isPrimary = slot === 'THUMBNAIL';
    if (isPrimary) {
      await this.repo.unsetPrimaryImages(productId);
    }

    const existingSlotImages = await this.repo.findImagesBySlot(productId, slot);
    const sortOrder = existingSlotImages.length;

    const img = await this.repo.createImage({
      productId,
      slot,
      url: uploadResult.url,
      publicId: uploadResult.publicId ?? uploadResult.key,
      width: uploadResult.width ?? null,
      height: uploadResult.height ?? null,
      format: uploadResult.format ?? null,
      bytes: uploadResult.bytes ?? null,
      altText: `${product.name} - ${slot.toLowerCase()}`,
      isPrimary,
      sortOrder,
    });

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: `PRODUCT_IMAGE_UPLOADED_${slot}`,
        targetType: 'PRODUCT',
        targetId: productId,
        metadata: { slot, publicId: img.publicId, url: img.url },
      });
    }

    return {
      id: img.id,
      slot: img.slot,
      url: img.url,
      publicId: img.publicId,
      width: img.width,
      height: img.height,
      format: img.format,
      bytes: img.bytes,
      responsiveUrls: getResponsiveImageUrls(img.url, img.publicId),
      altText: img.altText,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
      variantId: img.variantId,
    };
  }

  /**
   * Admin: Delete product image (DB + storage deletion with orphan cleanup logging)
   */
  async deleteProductImage(imageId: string, actor?: AccessTokenPayload): Promise<void> {
    const image = await this.repo.findImageById(imageId);
    if (!image) {
      throw AppError.notFound('Product image not found');
    }

    await this.repo.deleteImage(imageId);

    const storageKey =
      image.publicId ||
      (image.url.startsWith('/uploads/') ? image.url.replace('/uploads/', '') : image.url);
    try {
      await this.storageSvc.deleteImage(storageKey);
    } catch (err) {
      logger.warn(
        {
          event: 'pendingStorageCleanup',
          publicId: image.publicId,
          productId: image.productId,
          slot: image.slot,
          err,
        },
        'Cloudinary destroy failed on image deletion; logged for pending cleanup',
      );
    }

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_IMAGE_DELETED',
        targetType: 'PRODUCT_IMAGE',
        targetId: imageId,
        metadata: { slot: image.slot, publicId: image.publicId, url: image.url },
      });
    }
  }

  /**
   * Admin: Batch reorder product images (GALLERY only)
   */
  async reorderProductImages(
    productId: string,
    items: Array<{ id: string; sortOrder: number }>,
    actor?: AccessTokenPayload,
  ): Promise<void> {
    const product = await this.repo.findById(productId);
    if (!product) {
      throw AppError.notFound('Product not found');
    }

    const allImages = await this.repo.findImagesByProductId(productId);
    const imageMap = new Map(allImages.map(img => [img.id, img]));

    for (const item of items) {
      const img = imageMap.get(item.id);
      if (!img) {
        throw AppError.badRequest(`Image ${item.id} does not belong to this product`);
      }
      if (img.slot !== 'GALLERY') {
        throw AppError.badRequest('Only gallery images can be reordered');
      }
    }

    await this.repo.reorderImages(items);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_IMAGES_REORDERED',
        targetType: 'PRODUCT',
        targetId: productId,
        metadata: { count: items.length },
      });
    }
  }
}

export const productsService = new ProductsService();
