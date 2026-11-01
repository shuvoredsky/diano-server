import { AppError } from '@/utils/app-error';
import { sanitizeDescription } from '@/utils/sanitize.util';
import { auditService, recordAuditSafe, type ActorContext, type IAuditService } from '@/services/audit.service';
import { PageStatus } from '@prisma/client';
import {
  type IPagesRepository,
  pagesRepository,
} from './pages.repository';
import type {
  CreatePageInput,
  UpdatePageInput,
  PageFilterOptions,
  PageBlock,
  PageNavSummary,
  Page,
  PageRevision,
} from './pages.types';
import {
  createPageSchema,
  updatePageSchema,
  SYSTEM_PAGE_SLUGS,
} from './pages.validation';
import type { Prisma } from '@prisma/client';

export class PagesService {
  constructor(
    private readonly repo: IPagesRepository = pagesRepository,
    private readonly audit: IAuditService = auditService,
  ) {}

  private sanitizeBlocks(blocks?: PageBlock[]): PageBlock[] {
    if (!blocks || !Array.isArray(blocks)) {
      return [];
    }
    return blocks.map(block => {
      if (block.type === 'richText') {
        return {
          ...block,
          html: sanitizeDescription(block.html),
        };
      }
      return block;
    });
  }

  async createPage(input: CreatePageInput, actor?: ActorContext): Promise<Page> {
    const validated = createPageSchema.parse(input);

    const existing = await this.repo.findBySlug(validated.slug);
    if (existing) {
      throw AppError.conflict(`A page with slug '${validated.slug}' already exists`);
    }

    const sanitizedContent = this.sanitizeBlocks(validated.content as PageBlock[]);

    const page = await this.repo.create({
      ...validated,
      content: sanitizedContent,
    });

    await recordAuditSafe(this.audit, actor, 'PAGE_CREATE', 'Page', page.id, {
      slug: page.slug,
      title: page.title,
      type: page.type,
      status: page.status,
    });

    return page;
  }

  async getPageById(id: string): Promise<Page> {
    const page = await this.repo.findById(id);
    if (!page) {
      throw AppError.notFound(`Page with ID '${id}' not found`);
    }
    return page;
  }

  async updatePage(id: string, input: UpdatePageInput, actor?: ActorContext): Promise<Page> {
    const page = await this.getPageById(id);
    const validated = updatePageSchema.parse(input);

    const sanitizedContent = validated.content !== undefined ? this.sanitizeBlocks(validated.content as PageBlock[]) : undefined;

    const updated = await this.repo.update(id, {
      ...validated,
      ...(sanitizedContent !== undefined && { content: sanitizedContent as PageBlock[] }),
    } as UpdatePageInput);

    await recordAuditSafe(this.audit, actor, 'PAGE_UPDATE', 'Page', id, {
      slug: page.slug,
      beforeTitle: page.title,
      afterTitle: updated.title,
      status: updated.status,
    });

    return updated;
  }

  async deletePage(id: string, actor?: ActorContext): Promise<Page> {
    const page = await this.getPageById(id);

    if (SYSTEM_PAGE_SLUGS.includes(page.slug as (typeof SYSTEM_PAGE_SLUGS)[number])) {
      throw AppError.badRequest(
        `System page '${page.slug}' is critical for store compliance and cannot be deleted.`,
      );
    }

    const deleted = await this.repo.delete(id);

    await recordAuditSafe(this.audit, actor, 'PAGE_DELETE', 'Page', id, {
      slug: page.slug,
      title: page.title,
    });

    return deleted;
  }

  async publishPage(id: string, actor?: ActorContext): Promise<Page> {
    const page = await this.getPageById(id);
    const nextVersion = page.version + 1;
    const now = new Date();

    // 1. Create append-only revision snapshot
    await this.repo.createRevision({
      pageId: page.id,
      version: nextVersion,
      title: page.title,
      content: page.content as unknown as Prisma.InputJsonValue,
      authorId: actor?.userId,
    });

    // 2. Update page to PUBLISHED status
    const updated = await this.repo.update(id, {
      status: PageStatus.PUBLISHED,
      version: nextVersion,
      publishedAt: now,
    });

    await recordAuditSafe(this.audit, actor, 'PAGE_PUBLISH', 'Page', id, {
      slug: page.slug,
      version: nextVersion,
      publishedAt: now,
    });

    return updated;
  }

  async unpublishPage(id: string, actor?: ActorContext): Promise<Page> {
    const page = await this.getPageById(id);

    const updated = await this.repo.update(id, {
      status: PageStatus.DRAFT,
    });

    await recordAuditSafe(this.audit, actor, 'PAGE_UNPUBLISH', 'Page', id, {
      slug: page.slug,
      status: PageStatus.DRAFT,
    });

    return updated;
  }

  async listRevisions(pageId: string): Promise<PageRevision[]> {
    await this.getPageById(pageId);
    return this.repo.findRevisions(pageId);
  }

  async restoreRevision(
    pageId: string,
    version: number,
    actor?: ActorContext,
  ): Promise<Page> {
    const page = await this.getPageById(pageId);
    const revision = await this.repo.findRevisionByVersion(pageId, version);

    if (!revision) {
      throw AppError.notFound(
        `Revision version ${version} not found for page '${page.slug}'`,
      );
    }

    const updated = await this.repo.update(pageId, {
      title: revision.title,
      content: revision.content as unknown as PageBlock[],
    });

    await recordAuditSafe(this.audit, actor, 'PAGE_RESTORE_REVISION', 'Page', pageId, {
      slug: page.slug,
      restoredFromVersion: version,
      title: revision.title,
    });

    return updated;
  }

  async listPages(
    filter: PageFilterOptions,
  ): Promise<{ items: Page[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const { items, total } = await this.repo.findAll(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getPublishedPageBySlug(slug: string): Promise<Page> {
    const page = await this.repo.findBySlug(slug);
    if (!page || page.status !== PageStatus.PUBLISHED) {
      throw AppError.notFound(`Page '${slug}' was not found or is currently not published.`);
    }
    return page;
  }

  async getPublicNavList(): Promise<PageNavSummary[]> {
    return this.repo.findPublishedPagesNav();
  }
}

export const pagesService = new PagesService();
