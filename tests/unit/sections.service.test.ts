import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SectionsService } from '@/modules/sections/sections.service';
import type {
  ISectionsRepository,
  SectionEntity,
} from '@/modules/sections/sections.types';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import type { IAuditService } from '@/services/audit.service';
import { prisma } from '@/config/database';

vi.mock('@/config/database', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
  },
}));

describe('SectionsService (Unit Tests with Mocked Repository)', () => {
  let mockRepo: Partial<ISectionsRepository>;
  let mockAuditSvc: { record: ReturnType<typeof vi.fn> };
  let service: SectionsService;

  const mockAdminActor: AccessTokenPayload = {
    userId: 'admin-1',
    sessionId: 'sess-1',
    roles: ['super-admin'],
    email: 'admin@diano.com',
  };

  const sampleSection: SectionEntity = {
    id: 'sec-root',
    name: 'Featured Collections',
    slug: 'featured-collections',
    description: 'Top picks of the season',
    imageUrl: 'https://example.com/banner.jpg',
    parentId: null,
    displayOrder: 1,
    isActive: true,
    startsAt: null,
    endsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { products: 3, children: 1 },
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      reorder: vi.fn(),
      countChildren: vi.fn().mockResolvedValue(0),
      countProducts: vi.fn().mockResolvedValue(0),
      getAncestors: vi.fn().mockResolvedValue([]),
      getDescendantIds: vi.fn().mockResolvedValue([]),
      assignProducts: vi.fn(),
      removeProduct: vi.fn(),
      reorderProducts: vi.fn(),
      getSectionProducts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      syncProductSections: vi.fn(),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new SectionsService(
      mockRepo as ISectionsRepository,
      mockAuditSvc as unknown as IAuditService,
      6,
    );
  });

  describe('createSection', () => {
    it('should auto-generate unique slug from name if not provided', async () => {
      vi.spyOn(mockRepo, 'findBySlug').mockResolvedValue(null);
      vi.spyOn(mockRepo, 'create').mockImplementation(async data => ({
        ...sampleSection,
        ...data,
        id: 'new-sec-1',
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        parentId: data.parentId ?? null,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
        startsAt: null,
        endsAt: null,
      }));

      const res = await service.createSection({ name: 'Summer Vibes' }, mockAdminActor);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Summer Vibes',
          slug: 'summer-vibes',
        }),
      );
      expect(res.slug).toBe('summer-vibes');
      expect(mockAuditSvc.record).toHaveBeenCalled();
    });

    it('should append numeric suffix to slug on naming collision', async () => {
      vi.spyOn(mockRepo, 'findBySlug')
        .mockResolvedValueOnce({ ...sampleSection, slug: 'summer-vibes' })
        .mockResolvedValueOnce(null);

      vi.spyOn(mockRepo, 'create').mockImplementation(async data => ({
        ...sampleSection,
        ...data,
        id: 'new-sec-2',
        description: null,
        imageUrl: null,
        parentId: null,
        displayOrder: 0,
        isActive: true,
        startsAt: null,
        endsAt: null,
      }));

      const res = await service.createSection({ name: 'Summer Vibes' }, mockAdminActor);

      expect(res.slug).toBe('summer-vibes-1');
    });

    it('should block creation if parent depth is already at max depth', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue({
        ...sampleSection,
        id: 'sec-level-6',
        parentId: 'sec-level-5',
      });
      vi.spyOn(mockRepo, 'getAncestors').mockResolvedValue([
        { ...sampleSection, id: 'sec-1' },
        { ...sampleSection, id: 'sec-2' },
        { ...sampleSection, id: 'sec-3' },
        { ...sampleSection, id: 'sec-4' },
        { ...sampleSection, id: 'sec-5' },
      ]);

      await expect(
        service.createSection(
          { name: 'Deep Section', parentId: 'sec-level-6' },
          mockAdminActor,
        ),
      ).rejects.toThrow('Maximum section depth of 6 levels exceeded');
    });
  });

  describe('updateSection & Hierarchy Rules', () => {
    it('should block setting a section as its own parent', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);

      await expect(
        service.updateSection('sec-root', { parentId: 'sec-root' }, mockAdminActor),
      ).rejects.toThrow('A section cannot be its own parent');
    });

    it('should block setting a descendant as parent (cycle protection)', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);
      vi.spyOn(mockRepo, 'getDescendantIds').mockResolvedValue(['sec-child', 'sec-grandchild']);

      await expect(
        service.updateSection('sec-root', { parentId: 'sec-grandchild' }, mockAdminActor),
      ).rejects.toThrow('Cannot set a descendant section as parent (cyclic hierarchy blocked)');
    });

    it('should block moves exceeding max depth limit', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);
      vi.spyOn(mockRepo, 'getDescendantIds').mockResolvedValue(['sec-child-1']);
      vi.spyOn(mockRepo, 'getAncestors').mockResolvedValue([
        { ...sampleSection, id: 'sec-1' },
        { ...sampleSection, id: 'sec-2' },
        { ...sampleSection, id: 'sec-3' },
        { ...sampleSection, id: 'sec-4' },
      ]);
      vi.spyOn(mockRepo, 'findAll').mockResolvedValue([
        sampleSection,
        { ...sampleSection, id: 'sec-child-1', parentId: 'sec-root' },
      ]);

      await expect(
        service.updateSection('sec-root', { parentId: 'some-level-5-sec' }, mockAdminActor),
      ).rejects.toThrow('Moving this section exceeds the maximum depth limit of 6');
    });
  });

  describe('deleteSection', () => {
    it('should block deletion if child sub-sections exist', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);
      vi.spyOn(mockRepo, 'countChildren').mockResolvedValue(2);

      await expect(service.deleteSection('sec-root', mockAdminActor)).rejects.toThrow(
        'Cannot delete section with 2 child sub-section(s)',
      );
    });

    it('should successfully delete section if no child sub-sections', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);
      vi.spyOn(mockRepo, 'countChildren').mockResolvedValue(0);
      vi.spyOn(mockRepo, 'delete').mockResolvedValue(sampleSection);

      const res = await service.deleteSection('sec-root', mockAdminActor);
      expect(res.id).toBe('sec-root');
      expect(mockRepo.delete).toHaveBeenCalledWith('sec-root');
      expect(mockAuditSvc.record).toHaveBeenCalled();
    });
  });

  describe('toggleActive', () => {
    it('should toggle active status', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);
      vi.spyOn(mockRepo, 'update').mockResolvedValue({ ...sampleSection, isActive: false });

      const res = await service.toggleActive('sec-root', mockAdminActor);
      expect(res.isActive).toBe(false);
      expect(mockRepo.update).toHaveBeenCalledWith('sec-root', { isActive: false });
    });
  });

  describe('product assignments', () => {
    it('should assign valid products to section', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);
      vi.spyOn(prisma.product, 'findMany').mockResolvedValue([
        { id: 'prod-1' } as any,
        { id: 'prod-2' } as any,
      ]);

      await service.assignProducts(
        'sec-root',
        { productIds: ['prod-1', 'prod-2'] },
        mockAdminActor,
      );

      expect(mockRepo.assignProducts).toHaveBeenCalledWith('sec-root', [
        { productId: 'prod-1', sortOrder: 0 },
        { productId: 'prod-2', sortOrder: 1 },
      ]);
    });

    it('should reject assignment if some product does not exist', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);
      vi.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: 'prod-1' } as any]);

      await expect(
        service.assignProducts(
          'sec-root',
          { productIds: ['prod-1', 'prod-invalid'] },
          mockAdminActor,
        ),
      ).rejects.toThrow('One or more products not found: prod-invalid');
    });

    it('should remove product from section', async () => {
      vi.spyOn(mockRepo, 'findById').mockResolvedValue(sampleSection);

      await service.removeProduct('sec-root', 'prod-1', mockAdminActor);
      expect(mockRepo.removeProduct).toHaveBeenCalledWith('sec-root', 'prod-1');
    });
  });

  describe('public storefront sections', () => {
    it('should return only active and scheduled sections in hierarchical order', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 100000);
      const future = new Date(now.getTime() + 100000);

      const secActive: SectionEntity = {
        ...sampleSection,
        id: 'sec-active',
        isActive: true,
        startsAt: past,
        endsAt: future,
      };

      const secExpired: SectionEntity = {
        ...sampleSection,
        id: 'sec-expired',
        isActive: true,
        startsAt: new Date(now.getTime() - 200000),
        endsAt: new Date(now.getTime() - 100000),
      };

      vi.spyOn(mockRepo, 'findAll').mockResolvedValue([secActive, secExpired]);

      const res = await service.getPublicSections();
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('sec-active');
    });
  });
});
