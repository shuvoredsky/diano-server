import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoriesService } from '@/modules/categories/categories.service';
import type {
  CategoryEntity,
  ICategoriesRepository,
} from '@/modules/categories/categories.types';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import type { IAuditService } from '@/services/audit.service';

describe('CategoriesService (Unit Tests with Mocked Repository)', () => {
  let mockRepo: Partial<ICategoriesRepository>;
  let mockAuditSvc: { record: ReturnType<typeof vi.fn> };
  let service: CategoriesService;

  const mockAdminActor: AccessTokenPayload = {
    userId: 'admin-1',
    sessionId: 'sess-1',
    roles: ['super-admin'],
    email: 'admin@diano.com',
  };

  const sampleCategory: CategoryEntity = {
    id: 'cat-root',
    name: 'Men Fashion',
    slug: 'men-fashion',
    description: 'Men clothing and accessories',
    image: 'https://example.com/cat.jpg',
    parentId: null,
    isFeatured: true,
    isActive: true,
    sortOrder: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { products: 5, children: 2 },
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      reorder: vi.fn(),
      countChildren: vi.fn().mockResolvedValue(0),
      countActiveProducts: vi.fn().mockResolvedValue(0),
      reassignProducts: vi.fn().mockResolvedValue(0),
      reassignChildren: vi.fn().mockResolvedValue(0),
      getAncestors: vi.fn().mockResolvedValue([]),
      getDescendantIds: vi.fn().mockResolvedValue([]),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new CategoriesService(
      mockRepo as ICategoriesRepository,
      mockAuditSvc as unknown as IAuditService,
    );
  });

  describe('createCategory', () => {
    it('should auto-generate unique slug from name if not provided', async () => {
      vi.spyOn(mockRepo, 'findBySlug').mockResolvedValue(null);
      vi.spyOn(mockRepo, 'create').mockImplementation(async data => ({
        ...sampleCategory,
        ...data,
        id: 'new-cat-1',
        description: data.description ?? null,
        image: data.image ?? null,
        parentId: data.parentId ?? null,
        isFeatured: data.isFeatured ?? false,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      }));

      const res = await service.createCategory({ name: 'Winter Jackets' }, mockAdminActor);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Winter Jackets',
          slug: 'winter-jackets',
        }),
      );
      expect(res.slug).toBe('winter-jackets');
      expect(mockAuditSvc.record).toHaveBeenCalled();
    });

    it('should append numeric suffix to slug on naming collision', async () => {
      // First call returns existing, second call returns null
      vi.spyOn(mockRepo, 'findBySlug')
        .mockResolvedValueOnce({ ...sampleCategory, slug: 'winter-jackets' })
        .mockResolvedValueOnce(null);

      vi.spyOn(mockRepo, 'create').mockImplementation(async data => ({
        ...sampleCategory,
        ...data,
        id: 'new-cat-2',
        description: null,
        image: null,
        parentId: null,
        isFeatured: false,
        isActive: true,
        sortOrder: 0,
      }));

      const res = await service.createCategory({ name: 'Winter Jackets' }, mockAdminActor);

      expect(res.slug).toBe('winter-jackets-1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'winter-jackets-1' }),
      );
    });

    it('should block creation if parent depth is already 3 (max depth exceeded)', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue({
        ...sampleCategory,
        id: 'cat-level-3',
        parentId: 'cat-level-2',
      });
      // Ancestors return 2 items -> parent is depth 3
      vi.spyOn(mockRepo, 'getAncestors').mockResolvedValue([
        { ...sampleCategory, id: 'cat-level-1' },
        { ...sampleCategory, id: 'cat-level-2' },
      ]);

      await expect(
        service.createCategory(
          { name: 'Sub-sub-category', parentId: 'cat-level-3' },
          mockAdminActor,
        ),
      ).rejects.toThrow('Maximum category depth of 3 levels exceeded');
    });
  });

  describe('updateCategory & Hierarchy Rules', () => {
    it('should block setting a category as its own parent', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleCategory);

      await expect(
        service.updateCategory('cat-root', { parentId: 'cat-root' }, mockAdminActor),
      ).rejects.toThrow('A category cannot be its own parent');
    });

    it('should block setting a descendant as parent (cycle protection)', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleCategory);
      vi.spyOn(mockRepo, 'getDescendantIds').mockResolvedValue(['cat-child', 'cat-grandchild']);

      await expect(
        service.updateCategory('cat-root', { parentId: 'cat-grandchild' }, mockAdminActor),
      ).rejects.toThrow('Cannot set a descendant category as parent (cyclic hierarchy blocked)');
    });

    it('should block hierarchy moves that exceed 3 levels total depth', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleCategory);
      vi.spyOn(mockRepo, 'getDescendantIds').mockResolvedValue(['cat-child-1']);
      // Parent is depth 2 (1 ancestor)
      vi.spyOn(mockRepo, 'getAncestors').mockResolvedValue([{ ...sampleCategory, id: 'root-2' }]);
      // Subtree depth is 2 (category + child)
      vi.spyOn(mockRepo, 'findAll').mockResolvedValue([
        sampleCategory,
        { ...sampleCategory, id: 'cat-child-1', parentId: 'cat-root' },
      ]);

      // parentDepth (2) + subtreeDepth (2) = 4 > 3
      await expect(
        service.updateCategory('cat-root', { parentId: 'some-level-2-cat' }, mockAdminActor),
      ).rejects.toThrow('Moving this category exceeds the maximum depth limit of 3');
    });
  });

  describe('deleteCategory', () => {
    it('should block delete if category has active products or children without reassignToId', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleCategory);
      vi.spyOn(mockRepo, 'countChildren').mockResolvedValue(2);
      vi.spyOn(mockRepo, 'countActiveProducts').mockResolvedValue(5);

      await expect(service.deleteCategory('cat-root', undefined, mockAdminActor)).rejects.toThrow(
        'Cannot delete category with 5 active product(s) and 2 subcategorie(s)',
      );
    });

    it('should reassign products and children before soft delete when reassignToId is provided', async () => {
      vi.spyOn(mockRepo, 'findById').mockImplementation(async id => {
        if (id === 'cat-root') return sampleCategory;
        if (id === 'cat-target') return { ...sampleCategory, id: 'cat-target', parentId: null };
        return null;
      });
      vi.spyOn(mockRepo, 'countChildren').mockResolvedValue(1);
      vi.spyOn(mockRepo, 'countActiveProducts').mockResolvedValue(2);
      vi.spyOn(mockRepo, 'getDescendantIds').mockResolvedValue(['cat-sub']);
      vi.spyOn(mockRepo, 'softDelete').mockResolvedValue({
        ...sampleCategory,
        deletedAt: new Date(),
        isActive: false,
      });

      const res = await service.deleteCategory('cat-root', 'cat-target', mockAdminActor);

      expect(mockRepo.reassignProducts).toHaveBeenCalledWith('cat-root', 'cat-target');
      expect(mockRepo.reassignChildren).toHaveBeenCalledWith('cat-root', null);
      expect(mockRepo.softDelete).toHaveBeenCalledWith('cat-root');
      expect(res.deletedAt).toBeDefined();
    });

    it('should block reassigning to self or descendant', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleCategory);
      vi.spyOn(mockRepo, 'countChildren').mockResolvedValue(1);

      await expect(service.deleteCategory('cat-root', 'cat-root', mockAdminActor)).rejects.toThrow(
        'Cannot reassign items to the category being deleted',
      );
    });
  });

  describe('Public Views & Inactive Cascade', () => {
    it('should construct public category tree excluding inactive categories and their children', async () => {
      const catRootActive: CategoryEntity = { ...sampleCategory, id: '1', name: 'Root 1', parentId: null };
      const catChild1: CategoryEntity = { ...sampleCategory, id: '2', name: 'Child 1', parentId: '1' };
      const catChild2Orphan: CategoryEntity = { ...sampleCategory, id: '3', name: 'Child Orphan', parentId: 'inactive-parent' };

      vi.spyOn(mockRepo, 'findAll').mockResolvedValue([catRootActive, catChild1, catChild2Orphan]);

      const tree = await service.getPublicCategoriesTree();

      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe('1');
      expect(tree[0]?.children).toHaveLength(1);
      expect(tree[0]?.children[0]?.id).toBe('2');
    });

    it('should throw 404 if requested category is inactive or deleted', async () => {
      vi.spyOn(mockRepo, 'findBySlug').mockResolvedValue({
        ...sampleCategory,
        isActive: false,
      });

      await expect(service.getPublicCategoryBySlug('inactive-slug')).rejects.toThrow(
        'Category not found',
      );
    });

    it('should throw 404 if any parent ancestor of the category is inactive (cascade rule)', async () => {
      vi.spyOn(mockRepo, 'findBySlug').mockResolvedValue({
        ...sampleCategory,
        id: 'child-1',
        isActive: true,
      });
      vi.spyOn(mockRepo, 'getAncestors').mockResolvedValue([
        { ...sampleCategory, id: 'parent-1', isActive: false }, // Parent is inactive!
      ]);

      await expect(service.getPublicCategoryBySlug('child-slug')).rejects.toThrow(
        'Category not found',
      );
    });

    it('should return breadcrumbs and active children when public category is requested', async () => {
      vi.spyOn(mockRepo, 'findBySlug').mockResolvedValue({
        ...sampleCategory,
        id: 'cat-clothing',
        slug: 'clothing',
        isActive: true,
      });
      vi.spyOn(mockRepo, 'getAncestors').mockResolvedValue([
        { ...sampleCategory, id: 'cat-fashion', name: 'Fashion', slug: 'fashion', isActive: true },
      ]);
      vi.spyOn(mockRepo, 'findAll').mockResolvedValue([
        { ...sampleCategory, id: 'cat-shirts', name: 'Shirts', parentId: 'cat-clothing', isActive: true },
      ]);

      const result = await service.getPublicCategoryBySlug('clothing');

      expect(result.breadcrumbs).toHaveLength(1);
      expect(result.breadcrumbs[0]?.slug).toBe('fashion');
      expect(result.children).toHaveLength(1);
      expect(result.children[0]?.name).toBe('Shirts');
    });
  });
});
