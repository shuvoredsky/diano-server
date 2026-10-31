import { AppError } from '@/utils/app-error';
import type {
  BreadcrumbItem,
  CategoryDetailResponse,
  CategoryEntity,
  CategoryTreeItem,
  CreateCategoryDto,
  ICategoriesRepository,
  ReorderCategoryItem,
  UpdateCategoryDto,
  CategoryProductFormSchemaResponse,
  SpecificationFieldDefinition,
} from './categories.types';
import { categoriesRepository as defaultCategoriesRepo } from './categories.repository';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import { storageService as defaultStorageService, type StorageService } from '@/services/storage.service';

export class CategoriesService {
  constructor(
    private readonly repo: ICategoriesRepository = defaultCategoriesRepo,
    private readonly auditSvc: IAuditService = defaultAuditService,
    private readonly storageSvc: StorageService = defaultStorageService,
  ) {}

  /**
   * Slugify helper
   */
  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Ensure unique slug with suffix collision avoidance
   */
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

  /**
   * Calculate category depth in tree (1 = Root, 2 = Child, 3 = Sub-child)
   */
  private async calculateDepth(parentId: string | null): Promise<number> {
    if (!parentId) return 1;
    const ancestors = await this.repo.getAncestors(parentId);
    return ancestors.length + 1;
  }

  /**
   * Calculate maximum depth of a category's subtree
   */
  private async getSubtreeMaxDepth(categoryId: string): Promise<number> {
    const allCategories = await this.repo.findAll(true);
    const getDepth = (id: string, current: number): number => {
      const children = allCategories.filter(c => c.parentId === id);
      if (children.length === 0) return current;
      return Math.max(...children.map(ch => getDepth(ch.id, current + 1)));
    };
    return getDepth(categoryId, 1);
  }

  /**
   * Admin: Create Category
   */
  async createCategory(
    dto: CreateCategoryDto,
    actor?: AccessTokenPayload,
  ): Promise<CategoryEntity> {
    const rawSlugSource = dto.slug && dto.slug.length > 0 ? dto.slug : dto.name;
    const slug = await this.generateUniqueSlug(rawSlugSource);

    // Verify parent & check max depth (max 3 levels)
    if (dto.parentId) {
      const parent = await this.repo.findById(dto.parentId);
      if (!parent) {
        throw AppError.notFound('Parent category not found');
      }

      const parentDepth = await this.calculateDepth(dto.parentId);
      if (parentDepth >= 3) {
        throw AppError.badRequest('Maximum category depth of 3 levels exceeded');
      }
    }

    const created = await this.repo.create({
      ...dto,
      slug,
    });

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'CATEGORY_CREATED',
        targetType: 'CATEGORY',
        targetId: created.id,
        metadata: { name: created.name, slug: created.slug, parentId: created.parentId },
      });
    }

    return created;
  }

  /**
   * Admin: Update Category (with cycle and depth protection)
   */
  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    actor?: AccessTokenPayload,
  ): Promise<CategoryEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Category not found');
    }

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.generateUniqueSlug(dto.slug, id);
    } else if (dto.name && dto.name !== existing.name && !dto.slug) {
      slug = await this.generateUniqueSlug(dto.name, id);
    }

    // Check parent hierarchy changes
    if (dto.parentId !== undefined && dto.parentId !== existing.parentId) {
      if (dto.parentId === id) {
        throw AppError.badRequest('A category cannot be its own parent');
      }

      if (dto.parentId !== null) {
        const parent = await this.repo.findById(dto.parentId);
        if (!parent) {
          throw AppError.notFound('Parent category not found');
        }

        // Cycle check: parent cannot be a descendant of current category
        const descendants = await this.repo.getDescendantIds(id);
        if (descendants.includes(dto.parentId)) {
          throw AppError.badRequest(
            'Cannot set a descendant category as parent (cyclic hierarchy blocked)',
          );
        }

        // Depth check: new parent depth + subtree depth of current category <= 3
        const parentDepth = await this.calculateDepth(dto.parentId);
        const subtreeDepth = await this.getSubtreeMaxDepth(id);
        if (parentDepth + subtreeDepth > 3) {
          throw AppError.badRequest('Moving this category exceeds the maximum depth limit of 3');
        }
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
        action: 'CATEGORY_UPDATED',
        targetType: 'CATEGORY',
        targetId: id,
        metadata: { before: existing, after: updated },
      });
    }

    return updated;
  }

  /**
   * Admin: Soft-delete Category (with products & children safety reassign)
   */
  async deleteCategory(
    id: string,
    reassignToId?: string,
    actor?: AccessTokenPayload,
  ): Promise<CategoryEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Category not found');
    }

    const childCount = await this.repo.countChildren(id);
    const productCount = await this.repo.countActiveProducts(id);

    if (childCount > 0 || productCount > 0) {
      if (!reassignToId) {
        throw AppError.badRequest(
          `Cannot delete category with ${productCount} active product(s) and ${childCount} subcategorie(s). Provide reassignToId to transfer them.`,
        );
      }

      if (reassignToId === id) {
        throw AppError.badRequest('Cannot reassign items to the category being deleted');
      }

      const targetCategory = await this.repo.findById(reassignToId);
      if (!targetCategory) {
        throw AppError.notFound('Target category for reassignment not found');
      }

      const descendants = await this.repo.getDescendantIds(id);
      if (descendants.includes(reassignToId)) {
        throw AppError.badRequest('Cannot reassign items to a descendant of the deleted category');
      }

      // Reassign products and children
      await this.repo.reassignProducts(id, reassignToId);
      await this.repo.reassignChildren(id, targetCategory.parentId);
    }

    const deleted = await this.repo.softDelete(id);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'CATEGORY_DELETED',
        targetType: 'CATEGORY',
        targetId: id,
        metadata: { reassignToId },
      });
    }

    return deleted;
  }

  /**
   * Admin: Set/Toggle Active Status
   */
  async updateStatus(
    id: string,
    isActive: boolean,
    actor?: AccessTokenPayload,
  ): Promise<CategoryEntity> {
    const category = await this.repo.findById(id);
    if (!category) {
      throw AppError.notFound('Category not found');
    }

    const updated = await this.repo.update(id, { isActive });

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'CATEGORY_STATUS_UPDATED',
        targetType: 'CATEGORY',
        targetId: id,
        metadata: { from: category.isActive, to: isActive },
      });
    }

    return updated;
  }

  /**
   * Admin: Set or remove category image
   */
  async updateImage(
    id: string,
    imageUrl: string | null,
    actor?: AccessTokenPayload,
  ): Promise<CategoryEntity> {
    const category = await this.repo.findById(id);
    if (!category) {
      throw AppError.notFound('Category not found');
    }

    const updated = await this.repo.update(id, { image: imageUrl });

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'CATEGORY_IMAGE_UPDATED',
        targetType: 'CATEGORY',
        targetId: id,
        metadata: { image: imageUrl },
      });
    }

    return updated;
  }

  /**
   * Admin: Upload category image file
   */
  async uploadCategoryImage(
    id: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    actor?: AccessTokenPayload,
  ): Promise<CategoryEntity> {
    const category = await this.repo.findById(id);
    if (!category) {
      throw AppError.notFound('Category not found');
    }

    const uploadResult = await this.storageSvc.uploadImage(file, 'categories');
    return this.updateImage(id, uploadResult.url, actor);
  }

  /**
   * Admin: Batch reorder categories
   */
  async reorderCategories(
    items: ReorderCategoryItem[],
    actor?: AccessTokenPayload,
  ): Promise<void> {
    await this.repo.reorder(items);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'CATEGORIES_REORDERED',
        targetType: 'CATEGORY',
        targetId: 'BULK',
        metadata: { count: items.length },
      });
    }
  }

  /**
   * Public: Get Categories Tree (only active categories where all ancestors are active)
   */
  async getPublicCategoriesTree(): Promise<CategoryTreeItem[]> {
    const activeCategories = await this.repo.findAll(false);

    // Filter to only those whose parent is either null or exists in the active set
    const activeIdSet = new Set(activeCategories.map(c => c.id));
    const validCategories = activeCategories.filter(
      c => c.parentId === null || activeIdSet.has(c.parentId),
    );

    // Build tree
    const map = new Map<string, CategoryTreeItem>();
    const roots: CategoryTreeItem[] = [];

    for (const cat of validCategories) {
      const item: CategoryTreeItem = {
        ...cat,
        depth: 1,
        productCount: cat._count?.products ?? 0,
        children: [],
      };
      map.set(cat.id, item);
    }

    for (const cat of validCategories) {
      const item = map.get(cat.id)!;
      if (cat.parentId && map.has(cat.parentId)) {
        const parent = map.get(cat.parentId)!;
        item.depth = parent.depth + 1;
        parent.children.push(item);
      } else if (!cat.parentId) {
        roots.push(item);
      }
    }

    return roots;
  }

  /**
   * Public: Get category by slug with breadcrumbs & active direct children
   */
  async getPublicCategoryBySlug(slug: string): Promise<CategoryDetailResponse> {
    const category = await this.repo.findBySlug(slug);
    if (!category || !category.isActive || category.deletedAt) {
      throw AppError.notFound('Category not found');
    }

    // Verify all ancestors are active (parent-inactive cascade rule)
    const ancestors = await this.repo.getAncestors(category.id);
    for (const ancestor of ancestors) {
      if (!ancestor.isActive || ancestor.deletedAt) {
        throw AppError.notFound('Category not found');
      }
    }

    const breadcrumbs: BreadcrumbItem[] = ancestors.map(a => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
    }));

    // Fetch active direct children
    const allActive = await this.repo.findAll(false);
    const directChildren = allActive.filter(c => c.parentId === category.id);

    return {
      ...category,
      productCount: category._count?.products ?? 0,
      breadcrumbs,
      children: directChildren,
    };
  }

  /**
   * Admin: Get all categories (flat list for management)
   */
  async getAdminCategories(): Promise<CategoryEntity[]> {
    return this.repo.findAll(true);
  }

  /**
   * Admin: Get single category by ID
   */
  async getCategoryById(id: string): Promise<CategoryEntity> {
    const category = await this.repo.findById(id);
    if (!category) {
      throw AppError.notFound('Category not found');
    }
    return category;
  }

  /**
   * Admin: Get category product form schema including inherited specification template from ancestors
   */
  async getProductFormSchema(categoryId: string): Promise<CategoryProductFormSchemaResponse> {
    const category = await this.repo.findById(categoryId);
    if (!category) {
      throw AppError.notFound('Category not found');
    }

    // getAncestors returns [root, ..., directParent, category]
    const ancestors = await this.repo.getAncestors(categoryId);
    const hierarchy = ancestors.some(a => a.id === category.id)
      ? ancestors
      : [...ancestors, category];

    const mergedTemplateMap = new Map<string, SpecificationFieldDefinition>();

    for (const cat of hierarchy) {
      const template = Array.isArray(cat.specificationTemplate)
        ? (cat.specificationTemplate as SpecificationFieldDefinition[])
        : [];

      for (const field of template) {
        // Child category definitions override ancestor definitions with the same key
        mergedTemplateMap.set(field.key.toLowerCase(), field);
      }
    }

    const mergedTemplate = Array.from(mergedTemplateMap.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    return {
      categoryId: category.id,
      categoryName: category.name,
      template: mergedTemplate,
    };
  }

  /**
   * Admin: Update specification template definition for a category
   */
  async updateSpecificationTemplate(
    categoryId: string,
    template: SpecificationFieldDefinition[],
    actor?: AccessTokenPayload,
  ): Promise<CategoryEntity> {
    const category = await this.repo.findById(categoryId);
    if (!category) {
      throw AppError.notFound('Category not found');
    }

    const updated = await this.repo.updateSpecificationTemplate(categoryId, template);

    await this.auditSvc.record({
      actorType: actor ? 'USER' : 'SYSTEM',
      actorId: actor?.userId ?? 'system',
      action: 'CATEGORY_SPEC_TEMPLATE_UPDATED',
      targetType: 'CATEGORY',
      targetId: categoryId,
      metadata: {
        actorEmail: actor?.email,
        previousCount: Array.isArray(category.specificationTemplate)
          ? (category.specificationTemplate as unknown[]).length
          : 0,
        newCount: template.length,
      },
    });

    return updated;
  }
}

export const categoriesService = new CategoriesService();
