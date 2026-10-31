import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import type {
  CategoryEntity,
  CreateCategoryDto,
  ICategoriesRepository,
  ReorderCategoryItem,
  UpdateCategoryDto,
} from './categories.types';

export class PrismaCategoriesRepository implements ICategoriesRepository {
  async findById(id: string): Promise<CategoryEntity | null> {
    return prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null, status: 'ACTIVE' } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    }) as Promise<CategoryEntity | null>;
  }

  async findBySlug(slug: string): Promise<CategoryEntity | null> {
    return prisma.category.findFirst({
      where: { slug, deletedAt: null },
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null, status: 'ACTIVE' } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    }) as Promise<CategoryEntity | null>;
  }

  async findAll(includeInactive = false): Promise<CategoryEntity[]> {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(!includeInactive ? { isActive: true } : {}),
    };

    return prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null, status: 'ACTIVE' } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    }) as unknown as Promise<CategoryEntity[]>;
  }

  async create(data: CreateCategoryDto & { slug: string }): Promise<CategoryEntity> {
    return prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        image: data.image,
        parentId: data.parentId ?? null,
        isFeatured: data.isFeatured ?? false,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    }) as unknown as Promise<CategoryEntity>;
  }

  async update(id: string, data: UpdateCategoryDto): Promise<CategoryEntity> {
    return prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.image !== undefined ? { image: data.image } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    }) as unknown as Promise<CategoryEntity>;
  }

  async softDelete(id: string): Promise<CategoryEntity> {
    return prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    }) as unknown as Promise<CategoryEntity>;
  }

  async reorder(items: ReorderCategoryItem[]): Promise<void> {
    await prisma.$transaction(
      items.map(item =>
        prisma.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  async countChildren(parentId: string): Promise<number> {
    return prisma.category.count({
      where: { parentId, deletedAt: null },
    });
  }

  async countActiveProducts(categoryId: string): Promise<number> {
    return prisma.product.count({
      where: { categoryId, deletedAt: null, status: 'ACTIVE' },
    });
  }

  async reassignProducts(fromCategoryId: string, toCategoryId: string): Promise<number> {
    const res = await prisma.product.updateMany({
      where: { categoryId: fromCategoryId },
      data: { categoryId: toCategoryId },
    });
    return res.count;
  }

  async reassignChildren(fromParentId: string, toParentId: string | null): Promise<number> {
    const res = await prisma.category.updateMany({
      where: { parentId: fromParentId },
      data: { parentId: toParentId },
    });
    return res.count;
  }

  async getAncestors(categoryId: string): Promise<CategoryEntity[]> {
    const ancestors: CategoryEntity[] = [];
    let currentId: string | null = categoryId;

    while (currentId) {
      const parent: CategoryEntity | null = await prisma.category.findFirst({
        where: { id: currentId, deletedAt: null },
      });
      if (!parent) break;
      ancestors.unshift(parent);
      currentId = parent.parentId;
    }

    return ancestors;
  }

  async getDescendantIds(categoryId: string): Promise<string[]> {
    const descendantIds: string[] = [];
    let currentLevelIds = [categoryId];

    while (currentLevelIds.length > 0) {
      const children = await prisma.category.findMany({
        where: {
          parentId: { in: currentLevelIds },
          deletedAt: null,
        },
        select: { id: true },
      });

      if (children.length === 0) break;
      const nextIds = children.map(c => c.id);
      descendantIds.push(...nextIds);
      currentLevelIds = nextIds;
    }

    return descendantIds;
  }
}

export const categoriesRepository = new PrismaCategoriesRepository();
