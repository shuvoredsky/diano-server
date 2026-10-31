import type { Decimal } from 'decimal.js';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ProductVariantEntity {
  id: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: Decimal | string;
  compareAtPrice: Decimal | string | null;
  costPrice: Decimal | string | null;
  attributes: Record<string, unknown>;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImageEntity {
  id: string;
  productId: string;
  variantId: string | null;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface ProductEntity {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  categoryId: string;
  status: string;
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  viewCount: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category?: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    deletedAt: Date | null;
  };
  variants?: ProductVariantEntity[];
  images?: ProductImageEntity[];
  tags?: Array<{ tag: { id: string; name: string; slug: string } }>;
  relatedTo?: Array<{ relatedProduct: { id: string; name: string; slug: string; isFeatured: boolean; status: string } }>;
}

export interface PublicVariantDto {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  attributes: Record<string, unknown>;
  isActive: boolean;
}

export interface PublicProductDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  categoryId: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  variants: PublicVariantDto[];
  images: Array<{
    id: string;
    url: string;
    altText: string | null;
    isPrimary: boolean;
    sortOrder: number;
    variantId: string | null;
  }>;
  tags: string[];
  createdAt: Date;
}

export interface AdminVariantDto extends PublicVariantDto {
  costPrice?: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminProductDto extends Omit<PublicProductDto, 'variants'> {
  status: string;
  viewCount: number;
  deletedAt: Date | null;
  updatedAt: Date;
  variants: AdminVariantDto[];
  relatedProductIds?: string[];
}

export interface CreateVariantInput {
  name: string;
  sku: string;
  barcode?: string | null;
  price: number | string;
  compareAtPrice?: number | string | null;
  costPrice?: number | string | null;
  attributes?: Record<string, unknown>;
  isActive?: boolean;
}

export interface CreateProductDto {
  name: string;
  slug?: string;
  description: string;
  shortDescription?: string | null;
  categoryId: string;
  status?: ProductStatus;
  isFeatured?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  tags?: string[];
  relatedProductIds?: string[];
  variants: CreateVariantInput[];
}

export interface UpdateProductDto {
  name?: string;
  slug?: string;
  description?: string;
  shortDescription?: string | null;
  categoryId?: string;
  status?: ProductStatus;
  isFeatured?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  tags?: string[];
  relatedProductIds?: string[];
}

export interface UpdateVariantDto {
  name?: string;
  sku?: string;
  barcode?: string | null;
  price?: number | string;
  compareAtPrice?: number | string | null;
  costPrice?: number | string | null;
  attributes?: Record<string, unknown>;
  isActive?: boolean;
}

export interface ProductQueryFilter {
  page?: number;
  limit?: number;
  q?: string;
  categoryId?: string;
  categoryIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  attributes?: Record<string, string>;
  isFeatured?: boolean;
  inStock?: boolean;
  status?: string;
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'popular';
}

export interface IProductsRepository {
  findById(id: string, includeDeleted?: boolean): Promise<ProductEntity | null>;
  findBySlug(slug: string): Promise<ProductEntity | null>;
  findBySku(sku: string): Promise<ProductVariantEntity | null>;
  findByBarcode(barcode: string): Promise<ProductVariantEntity | null>;
  findProducts(
    filter: ProductQueryFilter,
    onlyActiveAndPublic?: boolean,
  ): Promise<{ items: ProductEntity[]; total: number }>;
  create(data: CreateProductDto & { slug: string }): Promise<ProductEntity>;
  update(id: string, data: UpdateProductDto): Promise<ProductEntity>;
  softDelete(id: string): Promise<ProductEntity>;
  updateStatus(id: string, status: string): Promise<ProductEntity>;
  toggleFeatured(id: string, isFeatured: boolean): Promise<ProductEntity>;
  incrementViewCount(id: string): Promise<void>;

  // Variant operations
  createVariant(productId: string, data: CreateVariantInput): Promise<ProductVariantEntity>;
  updateVariant(variantId: string, data: UpdateVariantDto): Promise<ProductVariantEntity>;
  softDeleteVariant(variantId: string): Promise<ProductVariantEntity>;
  findVariantById(variantId: string): Promise<ProductVariantEntity | null>;
  hasStockOrOrders(variantId: string): Promise<boolean>;

  // Related products
  setRelatedProducts(productId: string, relatedProductIds: string[]): Promise<void>;
  findRelatedProducts(productId: string): Promise<ProductEntity[]>;
}
