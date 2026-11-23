import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import type {
  CreateSectionDto,
  ISectionsRepository,
  ReorderSectionItem,
  SectionEntity,
  UpdateSectionDto,
} from './sections.types';

export class PrismaSectionsRepository implements ISectionsRepository {
  async findById(id: string): Promise<SectionEntity | null> {
    return prisma.section.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    }) as Promise<SectionEntity | null>;
  }

  async findBySlug(slug: string): Promise<SectionEntity | null> {
    return prisma.section.findUnique({
      where: { slug },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    }) as Promise<SectionEntity | null>;
  }

  async findAll(includeInactive = false): Promise<SectionEntity[]> {
    const where: Prisma.SectionWhereInput = includeInactive ? {} : { isActive: true };

    return prisma.section.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    }) as unknown as Promise<SectionEntity[]>;
  }

  async create(data: CreateSectionDto & { slug: string }): Promise<SectionEntity> {
    return prisma.section.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        parentId: data.parentId ?? null,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
      },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    }) as unknown as Promise<SectionEntity>;
  }

  async update(id: string, data: UpdateSectionDto): Promise<SectionEntity> {
    return prisma.section.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.displayOrder !== undefined ? { displayOrder: data.displayOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.startsAt !== undefined
          ? { startsAt: data.startsAt ? new Date(data.startsAt) : null }
          : {}),
        ...(data.endsAt !== undefined
          ? { endsAt: data.endsAt ? new Date(data.endsAt) : null }
          : {}),
      },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    }) as unknown as Promise<SectionEntity>;
  }

  async delete(id: string): Promise<SectionEntity> {
    return prisma.section.delete({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    }) as unknown as Promise<SectionEntity>;
  }

  async reorder(items: ReorderSectionItem[]): Promise<void> {
    await prisma.$transaction(
      items.map(item =>
        prisma.section.update({
          where: { id: item.id },
          data: {
            displayOrder: item.displayOrder,
            ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
          },
        }),
      ),
    );
  }

  async getAncestors(id: string): Promise<SectionEntity[]> {
    const ancestors: SectionEntity[] = [];
    let currentId: string | null = id;

    while (currentId) {
      const section: SectionEntity | null = (await prisma.section.findUnique({
        where: { id: currentId },
      })) as SectionEntity | null;
      if (!section) break;
      ancestors.unshift(section);
      currentId = section.parentId;
    }

    return ancestors;
  }

  async getDescendantIds(id: string): Promise<string[]> {
    const descendantIds: string[] = [];
    let currentLevelIds = [id];

    while (currentLevelIds.length > 0) {
      const children = await prisma.section.findMany({
        where: { parentId: { in: currentLevelIds } },
        select: { id: true },
      });

      if (children.length === 0) break;
      const nextIds = children.map(c => c.id);
      descendantIds.push(...nextIds);
      currentLevelIds = nextIds;
    }

    return descendantIds;
  }

  async countChildren(parentId: string): Promise<number> {
    return prisma.section.count({
      where: { parentId },
    });
  }

  async countProducts(sectionId: string): Promise<number> {
    return prisma.productSection.count({
      where: { sectionId },
    });
  }

  async assignProducts(
    sectionId: string,
    items: Array<{ productId: string; sortOrder: number }>,
  ): Promise<void> {
    await prisma.$transaction(
      items.map(item =>
        prisma.productSection.upsert({
          where: {
            productId_sectionId: {
              productId: item.productId,
              sectionId,
            },
          },
          update: {
            sortOrder: item.sortOrder,
          },
          create: {
            productId: item.productId,
            sectionId,
            sortOrder: item.sortOrder,
          },
        }),
      ),
    );
  }

  async removeProduct(sectionId: string, productId: string): Promise<void> {
    await prisma.productSection.delete({
      where: {
        productId_sectionId: {
          productId,
          sectionId,
        },
      },
    });
  }

  async reorderProducts(
    sectionId: string,
    items: Array<{ productId: string; sortOrder: number }>,
  ): Promise<void> {
    await prisma.$transaction(
      items.map(item =>
        prisma.productSection.update({
          where: {
            productId_sectionId: {
              productId: item.productId,
              sectionId,
            },
          },
          data: {
            sortOrder: item.sortOrder,
          },
        }),
      ),
    );
  }

  async getSectionProducts(
    sectionId: string,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; total: number }> {
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      prisma.productSection.count({
        where: {
          sectionId,
          product: {
            deletedAt: null,
            status: 'ACTIVE',
            category: { isActive: true, deletedAt: null },
          },
        },
      }),
      prisma.productSection.findMany({
        where: {
          sectionId,
          product: {
            deletedAt: null,
            status: 'ACTIVE',
            category: { isActive: true, deletedAt: null },
          },
        },
        orderBy: [{ sortOrder: 'asc' }],
        skip,
        take: limit,
        include: {
          product: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
              images: {
                orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                select: { id: true, url: true, altText: true, isPrimary: true, sortOrder: true },
              },
              variants: {
                where: { deletedAt: null, isActive: true },
                orderBy: { price: 'asc' },
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  price: true,
                  compareAtPrice: true,
                  attributes: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const items = rows.map(r => {
      const p = r.product;
      const primaryImg = p.images.find(img => img.isPrimary) || p.images[0] || null;
      const minPrice =
        p.variants.length > 0
          ? Math.min(...p.variants.map(v => Number(v.price)))
          : p.mrp ? Number(p.mrp) : 0;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        shortDescription: p.shortDescription,
        category: p.category,
        primaryImage: primaryImg?.url ?? null,
        images: p.images.map(img => img.url),
        price: minPrice,
        mrp: p.mrp ? Number(p.mrp) : null,
        discountType: p.discountType,
        discountValue: p.discountValue ? Number(p.discountValue) : null,
        freeShipping: p.freeShipping,
        isFeatured: p.isFeatured,
        averageRating: Number(p.averageRating),
        reviewCount: p.reviewCount,
        sectionSortOrder: r.sortOrder,
        variantsCount: p.variants.length,
      };
    });

    return { items, total };
  }

  async syncProductSections(productId: string, sectionIds: string[]): Promise<void> {
    await prisma.$transaction(async tx => {
      await tx.productSection.deleteMany({
        where: { productId },
      });

      if (sectionIds.length > 0) {
        await tx.productSection.createMany({
          data: sectionIds.map((sectionId, idx) => ({
            productId,
            sectionId,
            sortOrder: idx,
          })),
          skipDuplicates: true,
        });
      }
    });
  }
}

export const sectionsRepository = new PrismaSectionsRepository();

