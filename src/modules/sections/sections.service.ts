import { AppError } from '@/utils/app-error';
import type {
  AssignSectionProductsDto,
  CreateSectionDto,
  ISectionsRepository,
  ReorderSectionItem,
  ReorderSectionProductsDto,
  SectionEntity,
  SectionTreeItem,
  UpdateSectionDto,
} from './sections.types';
import { sectionsRepository as defaultSectionsRepo } from './sections.repository';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import { prisma } from '@/config/database';

export class SectionsService {
  constructor(
    private readonly repo: ISectionsRepository = defaultSectionsRepo,
    private readonly auditSvc: IAuditService = defaultAuditService,
    private readonly maxDepth: number = 6,
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

  private async calculateDepth(parentId: string | null): Promise<number> {
    if (!parentId) return 1;
    const ancestors = await this.repo.getAncestors(parentId);
    return ancestors.length + 1;
  }

  private async getSubtreeMaxDepth(sectionId: string): Promise<number> {
    const all = await this.repo.findAll(true);
    const getDepth = (id: string, current: number): number => {
      const children = all.filter(s => s.parentId === id);
      if (children.length === 0) return current;
      return Math.max(...children.map(ch => getDepth(ch.id, current + 1)));
    };
    return getDepth(sectionId, 1);
  }

  // ================= Admin Operations =================

  async createSection(
    dto: CreateSectionDto,
    actor?: AccessTokenPayload,
  ): Promise<SectionEntity> {
    const rawSlug = dto.slug && dto.slug.length > 0 ? dto.slug : dto.name;
    const slug = await this.generateUniqueSlug(rawSlug);

    if (dto.parentId) {
      const parent = await this.repo.findById(dto.parentId);
      if (!parent) {
        throw AppError.notFound('Parent section not found');
      }

      const parentDepth = await this.calculateDepth(dto.parentId);
      if (parentDepth >= this.maxDepth) {
        throw AppError.badRequest(`Maximum section depth of ${this.maxDepth} levels exceeded`);
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
        action: 'SECTION_CREATED',
        targetType: 'SECTION',
        targetId: created.id,
        metadata: { name: created.name, slug: created.slug, parentId: created.parentId },
      });
    }

    return created;
  }

  async updateSection(
    id: string,
    dto: UpdateSectionDto,
    actor?: AccessTokenPayload,
  ): Promise<SectionEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Section not found');
    }

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.generateUniqueSlug(dto.slug, id);
    } else if (dto.name && dto.name !== existing.name && !dto.slug) {
      slug = await this.generateUniqueSlug(dto.name, id);
    }

    if (dto.parentId !== undefined && dto.parentId !== existing.parentId) {
      if (dto.parentId === id) {
        throw AppError.badRequest('A section cannot be its own parent');
      }

      if (dto.parentId !== null) {
        const parent = await this.repo.findById(dto.parentId);
        if (!parent) {
          throw AppError.notFound('Parent section not found');
        }

        const descendants = await this.repo.getDescendantIds(id);
        if (descendants.includes(dto.parentId)) {
          throw AppError.badRequest('Cannot set a descendant section as parent (cyclic hierarchy blocked)');
        }

        const parentDepth = await this.calculateDepth(dto.parentId);
        const subtreeDepth = await this.getSubtreeMaxDepth(id);
        if (parentDepth + subtreeDepth > this.maxDepth) {
          throw AppError.badRequest(`Moving this section exceeds the maximum depth limit of ${this.maxDepth}`);
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
        action: 'SECTION_UPDATED',
        targetType: 'SECTION',
        targetId: id,
        metadata: { before: existing, after: updated },
      });
    }

    return updated;
  }

  async deleteSection(
    id: string,
    actor?: AccessTokenPayload,
  ): Promise<SectionEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Section not found');
    }

    const childCount = await this.repo.countChildren(id);
    if (childCount > 0) {
      throw AppError.badRequest(`Cannot delete section with ${childCount} child sub-section(s). Remove or reassign them first.`);
    }

    const deleted = await this.repo.delete(id);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'SECTION_DELETED',
        targetType: 'SECTION',
        targetId: id,
        metadata: { name: existing.name, slug: existing.slug },
      });
    }

    return deleted;
  }

  async toggleActive(
    id: string,
    actor?: AccessTokenPayload,
  ): Promise<SectionEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound('Section not found');
    }

    const updated = await this.repo.update(id, { isActive: !existing.isActive });

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'SECTION_TOGGLED',
        targetType: 'SECTION',
        targetId: id,
        metadata: { from: existing.isActive, to: updated.isActive },
      });
    }

    return updated;
  }

  async reorderSections(
    items: ReorderSectionItem[],
    actor?: AccessTokenPayload,
  ): Promise<void> {
    await this.repo.reorder(items);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'SECTIONS_REORDERED',
        targetType: 'SECTION',
        targetId: 'BULK',
        metadata: { count: items.length },
      });
    }
  }

  async getAdminSections(): Promise<SectionTreeItem[]> {
    const all = await this.repo.findAll(true);

    const map = new Map<string, SectionTreeItem>();
    const roots: SectionTreeItem[] = [];

    for (const sec of all) {
      const item: SectionTreeItem = {
        ...sec,
        depth: 1,
        productCount: sec._count?.products ?? 0,
        children: [],
      };
      map.set(sec.id, item);
    }

    for (const sec of all) {
      const item = map.get(sec.id)!;
      if (sec.parentId && map.has(sec.parentId)) {
        const parent = map.get(sec.parentId)!;
        parent.children.push(item);
      } else if (!sec.parentId) {
        roots.push(item);
      }
    }

    const setDepths = (nodes: SectionTreeItem[], depth: number) => {
      for (const node of nodes) {
        node.depth = depth;
        if (node.children.length > 0) {
          setDepths(node.children, depth + 1);
        }
      }
    };
    setDepths(roots, 1);

    return roots;
  }

  async getSectionById(id: string): Promise<SectionEntity> {
    const section = await this.repo.findById(id);
    if (!section) {
      throw AppError.notFound('Section not found');
    }
    return section;
  }

  // ================= Product Assignment Operations =================

  async assignProducts(
    sectionId: string,
    dto: AssignSectionProductsDto,
    actor?: AccessTokenPayload,
  ): Promise<void> {
    const section = await this.repo.findById(sectionId);
    if (!section) {
      throw AppError.notFound('Section not found');
    }

    let itemsToAssign: Array<{ productId: string; sortOrder: number }> = [];

    if (dto.items && dto.items.length > 0) {
      itemsToAssign = dto.items.map((item, idx) => ({
        productId: item.productId,
        sortOrder: item.sortOrder ?? idx,
      }));
    } else if (dto.productIds && dto.productIds.length > 0) {
      itemsToAssign = dto.productIds.map((pId, idx) => ({
        productId: pId,
        sortOrder: idx,
      }));
    }

    // Verify products exist
    const productIds = itemsToAssign.map(i => i.productId);
    const existingProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true },
    });

    const validIdSet = new Set(existingProducts.map(p => p.id));
    const invalidIds = productIds.filter(id => !validIdSet.has(id));
    if (invalidIds.length > 0) {
      throw AppError.badRequest(`One or more products not found: ${invalidIds.join(', ')}`);
    }

    await this.repo.assignProducts(sectionId, itemsToAssign);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'SECTION_PRODUCTS_ASSIGNED',
        targetType: 'SECTION',
        targetId: sectionId,
        metadata: { count: itemsToAssign.length },
      });
    }
  }

  async removeProduct(
    sectionId: string,
    productId: string,
    actor?: AccessTokenPayload,
  ): Promise<void> {
    const section = await this.repo.findById(sectionId);
    if (!section) {
      throw AppError.notFound('Section not found');
    }

    await this.repo.removeProduct(sectionId, productId);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'SECTION_PRODUCT_REMOVED',
        targetType: 'SECTION',
        targetId: sectionId,
        metadata: { productId },
      });
    }
  }

  async reorderProducts(
    sectionId: string,
    dto: ReorderSectionProductsDto,
    actor?: AccessTokenPayload,
  ): Promise<void> {
    const section = await this.repo.findById(sectionId);
    if (!section) {
      throw AppError.notFound('Section not found');
    }

    await this.repo.reorderProducts(sectionId, dto.items);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'SECTION_PRODUCTS_REORDERED',
        targetType: 'SECTION',
        targetId: sectionId,
        metadata: { count: dto.items.length },
      });
    }
  }

  // ================= Public Storefront Operations =================

  async getPublicSections(): Promise<SectionTreeItem[]> {
    const now = new Date();
    const all = await this.repo.findAll(false);

    // Filter active and within schedule window (startsAt <= now <= endsAt)
    const activeAndScheduled = all.filter(sec => {
      if (!sec.isActive) return false;
      if (sec.startsAt && new Date(sec.startsAt) > now) return false;
      if (sec.endsAt && new Date(sec.endsAt) < now) return false;
      return true;
    });

    const activeIdSet = new Set(activeAndScheduled.map(s => s.id));
    const validSections = activeAndScheduled.filter(
      s => s.parentId === null || activeIdSet.has(s.parentId),
    );

    const map = new Map<string, SectionTreeItem>();
    const roots: SectionTreeItem[] = [];

    for (const sec of validSections) {
      const item: SectionTreeItem = {
        ...sec,
        depth: 1,
        productCount: sec._count?.products ?? 0,
        children: [],
      };
      map.set(sec.id, item);
    }

    for (const sec of validSections) {
      const item = map.get(sec.id)!;
      if (sec.parentId && map.has(sec.parentId)) {
        const parent = map.get(sec.parentId)!;
        parent.children.push(item);
      } else if (!sec.parentId) {
        roots.push(item);
      }
    }

    const setDepths = (nodes: SectionTreeItem[], depth: number) => {
      for (const node of nodes) {
        node.depth = depth;
        if (node.children.length > 0) {
          setDepths(node.children, depth + 1);
        }
      }
    };
    setDepths(roots, 1);

    return roots;
  }

  async getPublicSectionProducts(
    slug: string,
    page = 1,
    limit = 20,
  ): Promise<{ section: SectionEntity; items: unknown[]; total: number; page: number; limit: number }> {
    const section = await this.repo.findBySlug(slug);
    if (!section || !section.isActive) {
      throw AppError.notFound('Section not found or inactive');
    }

    const now = new Date();
    if (section.startsAt && new Date(section.startsAt) > now) {
      throw AppError.notFound('Section not found or inactive');
    }
    if (section.endsAt && new Date(section.endsAt) < now) {
      throw AppError.notFound('Section not found or inactive');
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));

    const result = await this.repo.getSectionProducts(section.id, safePage, safeLimit);

    return {
      section,
      items: result.items,
      total: result.total,
      page: safePage,
      limit: safeLimit,
    };
  }
}

export const sectionsService = new SectionsService();

