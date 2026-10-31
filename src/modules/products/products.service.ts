import { AppError } from '@/utils/app-error';
import { viewDeduplicator } from '@/utils/view-dedupe.util';
import { logger } from '@/utils/logger';
import type {
  AdminProductDto,
  AdminVariantDto,
  CreateProductDto,
  CreateVariantInput,
  IProductsRepository,
  ProductEntity,
  ProductQueryFilter,
  ProductVariantEntity,
  PublicProductDto,
  PublicVariantDto,
  UpdateProductDto,
  UpdateVariantDto,
  ProductImageEntity,
} from './products.types';
import { productsRepository as defaultProductsRepo } from './products.repository';
import type { ICategoriesRepository } from '@/modules/categories/categories.types';
import { categoriesRepository as defaultCategoriesRepo } from '@/modules/categories/categories.repository';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import { storageService as defaultStorageService, type StorageService } from '@/services/storage.service';

export class ProductsService {
  constructor(
    private readonly repo: IProductsRepository = defaultProductsRepo,
    private readonly categoriesRepo: ICategoriesRepository = defaultCategoriesRepo,
    private readonly auditSvc: IAuditService = defaultAuditService,
    private readonly storageSvc: StorageService = defaultStorageService,
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
      isFeatured: p.isFeatured,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      metaKeywords: p.metaKeywords,
      variants: activeVariants,
      images: (p.images ?? []).map(img => ({
        id: img.id,
        url: img.url,
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

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      shortDescription: p.shortDescription,
      categoryId: p.categoryId,
      category: p.category,
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
        url: img.url,
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
    if (!category) {
      throw AppError.notFound('Category not found');
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
    }

    // 3. Generate unique slug
    const rawSlug = dto.slug && dto.slug.length > 0 ? dto.slug : dto.name;
    const slug = await this.generateUniqueSlug(rawSlug);

    // 4. Create in repository
    const product = await this.repo.create({
      ...dto,
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

    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      const category = await this.categoriesRepo.findById(dto.categoryId);
      if (!category) {
        throw AppError.notFound('Target category not found');
      }
    }

    const updated = await this.repo.update(id, {
      ...dto,
      slug,
    });

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
   * Admin: Delete product image (DB + storage deletion)
   */
  async deleteProductImage(imageId: string, actor?: AccessTokenPayload): Promise<void> {
    const image = await this.repo.findImageById(imageId);
    if (!image) {
      throw AppError.notFound('Product image not found');
    }

    await this.repo.deleteImage(imageId);

    const storageKey = image.url.startsWith('/uploads/')
      ? image.url.replace('/uploads/', '')
      : image.url;
    await this.storageSvc.deleteImage(storageKey);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PRODUCT_IMAGE_DELETED',
        targetType: 'PRODUCT_IMAGE',
        targetId: imageId,
        metadata: { url: image.url },
      });
    }
  }

  /**
   * Admin: Batch reorder product images
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
