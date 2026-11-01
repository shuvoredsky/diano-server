import { prisma } from '@/config/database';
import { Prisma } from '@prisma/client';
import type {
  CreateProductDto,
  CreateVariantInput,
  IProductsRepository,
  ProductEntity,
  ProductImageEntity,
  ProductImageSlot,
  ProductQueryFilter,
  ProductVariantEntity,
  UpdateProductDto,
  UpdateVariantDto,
} from './products.types';

export class PrismaProductsRepository implements IProductsRepository {
  async findById(id: string, includeDeleted = false): Promise<ProductEntity | null> {
    return prisma.product.findFirst({
      where: {
        id,
        ...(!includeDeleted ? { deletedAt: null } : {}),
      },
      include: {
        category: true,
        variants: {
          where: { deletedAt: null },
          orderBy: { price: 'asc' },
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
        tags: {
          include: { tag: true },
        },
        relatedTo: {
          include: { relatedProduct: true },
        },
      },
    }) as unknown as Promise<ProductEntity | null>;
  }

  async findBySlug(slug: string): Promise<ProductEntity | null> {
    return prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: {
        category: true,
        variants: {
          where: { deletedAt: null },
          orderBy: { price: 'asc' },
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
        tags: {
          include: { tag: true },
        },
        relatedTo: {
          include: { relatedProduct: true },
        },
      },
    }) as unknown as Promise<ProductEntity | null>;
  }

  async findBySku(sku: string): Promise<ProductVariantEntity | null> {
    return prisma.productVariant.findFirst({
      where: { sku, deletedAt: null },
    }) as unknown as Promise<ProductVariantEntity | null>;
  }

  async findByBarcode(barcode: string): Promise<ProductVariantEntity | null> {
    return prisma.productVariant.findFirst({
      where: { barcode, deletedAt: null },
    }) as unknown as Promise<ProductVariantEntity | null>;
  }

  async findProducts(
    filter: ProductQueryFilter,
    onlyActiveAndPublic = false,
  ): Promise<{ items: ProductEntity[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(onlyActiveAndPublic
        ? {
            status: 'ACTIVE',
            category: { isActive: true, deletedAt: null },
          }
        : filter.status
          ? { status: filter.status }
          : {}),
      ...(filter.isFeatured !== undefined ? { isFeatured: filter.isFeatured } : {}),
      ...(filter.categoryIds && filter.categoryIds.length > 0
        ? { categoryId: { in: filter.categoryIds } }
        : filter.categoryId
          ? { categoryId: filter.categoryId }
          : {}),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: 'insensitive' } },
              { description: { contains: filter.q, mode: 'insensitive' } },
              { shortDescription: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.tags && filter.tags.length > 0
        ? {
            tags: {
              some: {
                tag: {
                  slug: { in: filter.tags.map(t => t.toLowerCase()) },
                },
              },
            },
          }
        : {}),
      ...(filter.minPrice !== undefined || filter.maxPrice !== undefined
        ? {
            variants: {
              some: {
                deletedAt: null,
                isActive: true,
                ...(filter.minPrice !== undefined ? { price: { gte: filter.minPrice } } : {}),
                ...(filter.maxPrice !== undefined ? { price: { lte: filter.maxPrice } } : {}),
              },
            },
          }
        : {}),
    };

    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    if (filter.sortBy === 'newest') {
      orderBy = { createdAt: 'desc' };
    } else if (filter.sortBy === 'name_asc') {
      orderBy = { name: 'asc' };
    } else if (filter.sortBy === 'name_desc') {
      orderBy = { name: 'desc' };
    } else if (filter.sortBy === 'popular') {
      orderBy = { viewCount: 'desc' };
    }

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: true,
          variants: {
            where: { deletedAt: null, ...(onlyActiveAndPublic ? { isActive: true } : {}) },
            orderBy: { price: 'asc' },
          },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          },
          tags: {
            include: { tag: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Handle price sorting in memory if needed (since price is in variant relation)
    if (filter.sortBy === 'price_asc') {
      items.sort((a, b) => {
        const pA = a.variants[0] ? Number(a.variants[0].price) : 0;
        const pB = b.variants[0] ? Number(b.variants[0].price) : 0;
        return pA - pB;
      });
    } else if (filter.sortBy === 'price_desc') {
      items.sort((a, b) => {
        const pA = a.variants[0] ? Number(a.variants[0].price) : 0;
        const pB = b.variants[0] ? Number(b.variants[0].price) : 0;
        return pB - pA;
      });
    }

    return { items: items as unknown as ProductEntity[], total };
  }

  async create(data: CreateProductDto & { slug: string }): Promise<ProductEntity> {
    return prisma.$transaction(async tx => {
      const product = await tx.product.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          shortDescription: data.shortDescription,
          categoryId: data.categoryId,
          videoUrl: data.videoUrl ?? null,
          freeShipping: data.freeShipping ?? false,
          inventoryType: data.inventoryType ?? 'READY_STOCK',
          specifications: (data.specifications ?? {}) as Prisma.InputJsonValue,
          discountType: data.discountType ?? 'NONE',
          discountValue:
            data.discountValue !== undefined && data.discountValue !== null
              ? new Prisma.Decimal(data.discountValue)
              : new Prisma.Decimal(0),
          specialOffer: data.specialOffer ?? false,
          mrp:
            data.mrp !== undefined && data.mrp !== null
              ? new Prisma.Decimal(data.mrp)
              : null,
          status: data.status ?? 'DRAFT',
          isFeatured: data.isFeatured ?? false,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
        },
      });

      // Create variants
      for (const v of data.variants) {
        await tx.productVariant.create({
          data: {
            productId: product.id,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode ?? null,
            price: v.price ?? 0,
            compareAtPrice: v.compareAtPrice ?? null,
            costPrice: v.costPrice ?? null,
            attributes: (v.attributes ?? {}) as Prisma.InputJsonValue,
            isActive: v.isActive ?? true,
          },
        });
      }

      // Handle tags if provided
      if (data.tags && data.tags.length > 0) {
        for (const tagName of data.tags) {
          const tagSlug = tagName.toLowerCase().replace(/[\s\W-]+/g, '-');
          const tag = await tx.tag.upsert({
            where: { slug: tagSlug },
            update: {},
            create: { name: tagName, slug: tagSlug },
          });
          await tx.productTag.create({
            data: { productId: product.id, tagId: tag.id },
          });
        }
      }

      // Handle related products if provided
      if (data.relatedProductIds && data.relatedProductIds.length > 0) {
        for (const relId of data.relatedProductIds) {
          await tx.relatedProduct.create({
            data: { productId: product.id, relatedProductId: relId },
          });
        }
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          category: true,
          variants: true,
          images: true,
          tags: { include: { tag: true } },
          relatedTo: { include: { relatedProduct: true } },
        },
      }) as unknown as Promise<ProductEntity>;
    });
  }

  async update(id: string, data: UpdateProductDto): Promise<ProductEntity> {
    return prisma.$transaction(async tx => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.shortDescription !== undefined ? { shortDescription: data.shortDescription } : {}),
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
          ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl } : {}),
          ...(data.freeShipping !== undefined ? { freeShipping: data.freeShipping } : {}),
          ...(data.inventoryType !== undefined ? { inventoryType: data.inventoryType } : {}),
          ...(data.specifications !== undefined
            ? { specifications: data.specifications as Prisma.InputJsonValue }
            : {}),
          ...(data.discountType !== undefined ? { discountType: data.discountType } : {}),
          ...(data.discountValue !== undefined
            ? {
                discountValue:
                  data.discountValue !== null
                    ? new Prisma.Decimal(data.discountValue)
                    : new Prisma.Decimal(0),
              }
            : {}),
          ...(data.specialOffer !== undefined ? { specialOffer: data.specialOffer } : {}),
          ...(data.mrp !== undefined
            ? { mrp: data.mrp !== null ? new Prisma.Decimal(data.mrp) : null }
            : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
          ...(data.metaTitle !== undefined ? { metaTitle: data.metaTitle } : {}),
          ...(data.metaDescription !== undefined ? { metaDescription: data.metaDescription } : {}),
          ...(data.metaKeywords !== undefined ? { metaKeywords: data.metaKeywords } : {}),
        },
      });

      if (data.tags) {
        await tx.productTag.deleteMany({ where: { productId: id } });
        for (const tagName of data.tags) {
          const tagSlug = tagName.toLowerCase().replace(/[\s\W-]+/g, '-');
          const tag = await tx.tag.upsert({
            where: { slug: tagSlug },
            update: {},
            create: { name: tagName, slug: tagSlug },
          });
          await tx.productTag.create({
            data: { productId: id, tagId: tag.id },
          });
        }
      }

      if (data.relatedProductIds) {
        await tx.relatedProduct.deleteMany({ where: { productId: id } });
        for (const relId of data.relatedProductIds) {
          await tx.relatedProduct.create({
            data: { productId: id, relatedProductId: relId },
          });
        }
      }

      return tx.product.findUnique({
        where: { id: updated.id },
        include: {
          category: true,
          variants: { where: { deletedAt: null } },
          images: true,
          tags: { include: { tag: true } },
          relatedTo: { include: { relatedProduct: true } },
        },
      }) as unknown as Promise<ProductEntity>;
    });
  }

  async softDelete(id: string): Promise<ProductEntity> {
    return prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
      },
    }) as unknown as Promise<ProductEntity>;
  }

  async updateStatus(id: string, status: string): Promise<ProductEntity> {
    return prisma.product.update({
      where: { id },
      data: { status },
    }) as unknown as Promise<ProductEntity>;
  }

  async toggleFeatured(id: string, isFeatured: boolean): Promise<ProductEntity> {
    return prisma.product.update({
      where: { id },
      data: { isFeatured },
    }) as unknown as Promise<ProductEntity>;
  }

  async incrementViewCount(id: string): Promise<void> {
    await prisma.product.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  }

  async createVariant(productId: string, data: CreateVariantInput): Promise<ProductVariantEntity> {
    return prisma.productVariant.create({
      data: {
        productId,
        name: data.name,
        sku: data.sku,
        barcode: data.barcode ?? null,
        price: data.price ?? 0,
        compareAtPrice: data.compareAtPrice ?? null,
        costPrice: data.costPrice ?? null,
        attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
        isActive: data.isActive ?? true,
      },
    }) as unknown as Promise<ProductVariantEntity>;
  }

  async updateVariant(variantId: string, data: UpdateVariantDto): Promise<ProductVariantEntity> {
    return prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sku !== undefined ? { sku: data.sku } : {}),
        ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.compareAtPrice !== undefined ? { compareAtPrice: data.compareAtPrice } : {}),
        ...(data.costPrice !== undefined ? { costPrice: data.costPrice } : {}),
        ...(data.attributes !== undefined ? { attributes: data.attributes as Prisma.InputJsonValue } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    }) as unknown as Promise<ProductVariantEntity>;
  }

  async softDeleteVariant(variantId: string): Promise<ProductVariantEntity> {
    return prisma.productVariant.update({
      where: { id: variantId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    }) as unknown as Promise<ProductVariantEntity>;
  }

  async findVariantById(variantId: string): Promise<ProductVariantEntity | null> {
    return prisma.productVariant.findFirst({
      where: { id: variantId, deletedAt: null },
    }) as unknown as Promise<ProductVariantEntity | null>;
  }

  /**
   * Real inventory check (M6):
   * Variant cannot be soft-deleted if active physical or reserved stock exists in any warehouse.
   * Note: Orders module check interface is preserved (pending Orders in M8).
   */
  async hasStockOrOrders(variantId: string): Promise<boolean> {
    const stockCount = await prisma.inventory.count({
      where: {
        variantId,
        OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }],
      },
    });

    if (stockCount > 0) {
      return true;
    }

    // Pending Orders module (M8): OrderItem check will evaluate active unfulfilled orders
    return false;
  }

  async setRelatedProducts(productId: string, relatedProductIds: string[]): Promise<void> {
    await prisma.$transaction(async tx => {
      await tx.relatedProduct.deleteMany({ where: { productId } });
      for (const relId of relatedProductIds) {
        await tx.relatedProduct.create({
          data: { productId, relatedProductId: relId },
        });
      }
    });
  }

  async findRelatedProducts(productId: string): Promise<ProductEntity[]> {
    const records = await prisma.relatedProduct.findMany({
      where: { productId },
      include: {
        relatedProduct: {
          include: {
            category: true,
            variants: { where: { deletedAt: null, isActive: true }, orderBy: { price: 'asc' } },
            images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
            tags: { include: { tag: true } },
          },
        },
      },
    });

    return records
      .map(r => r.relatedProduct)
      .filter(p => p.status === 'ACTIVE' && p.deletedAt === null) as unknown as ProductEntity[];
  }

  async createImage(data: {
    productId: string;
    variantId?: string | null;
    slot?: ProductImageSlot;
    url: string;
    publicId?: string | null;
    width?: number | null;
    height?: number | null;
    format?: string | null;
    bytes?: number | null;
    altText?: string | null;
    isPrimary?: boolean;
    sortOrder?: number;
  }): Promise<ProductImageEntity> {
    return prisma.productImage.create({
      data: {
        productId: data.productId,
        variantId: data.variantId ?? null,
        slot: data.slot ?? 'GALLERY',
        url: data.url,
        publicId: data.publicId ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        format: data.format ?? null,
        bytes: data.bytes ?? null,
        altText: data.altText ?? null,
        isPrimary: data.isPrimary ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
    }) as unknown as Promise<ProductImageEntity>;
  }

  async findImagesBySlot(productId: string, slot: ProductImageSlot): Promise<ProductImageEntity[]> {
    return prisma.productImage.findMany({
      where: { productId, slot },
      orderBy: { sortOrder: 'asc' },
    }) as unknown as Promise<ProductImageEntity[]>;
  }

  async findImagesByProductId(productId: string): Promise<ProductImageEntity[]> {
    return prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    }) as unknown as Promise<ProductImageEntity[]>;
  }

  async updateImage(
    imageId: string,
    data: { altText?: string | null; isPrimary?: boolean; sortOrder?: number },
  ): Promise<ProductImageEntity> {
    return prisma.productImage.update({
      where: { id: imageId },
      data: {
        ...(data.altText !== undefined ? { altText: data.altText } : {}),
        ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
  }

  async findImageById(imageId: string): Promise<ProductImageEntity | null> {
    return prisma.productImage.findUnique({
      where: { id: imageId },
    });
  }

  async deleteImage(imageId: string): Promise<void> {
    await prisma.productImage.delete({
      where: { id: imageId },
    });
  }

  async unsetPrimaryImages(productId: string): Promise<void> {
    await prisma.productImage.updateMany({
      where: { productId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  async reorderImages(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await prisma.$transaction(
      items.map(item =>
        prisma.productImage.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }
}

export const productsRepository = new PrismaProductsRepository();
