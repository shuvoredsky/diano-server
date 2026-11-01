import { prisma } from '@/config/database';
import type { Prisma, Page, PageRevision } from '@prisma/client';
import { PageStatus } from '@prisma/client';
import type {
  CreatePageInput,
  UpdatePageInput,
  PageFilterOptions,
  PageNavSummary,
} from './pages.types';

export interface IPagesRepository {
  create(data: CreatePageInput): Promise<Page>;
  findById(id: string): Promise<Page | null>;
  findBySlug(slug: string): Promise<Page | null>;
  update(
    id: string,
    data: UpdatePageInput & { version?: number; publishedAt?: Date | null },
  ): Promise<Page>;
  delete(id: string): Promise<Page>;
  findAll(filter: PageFilterOptions): Promise<{ items: Page[]; total: number }>;
  findPublishedPagesNav(): Promise<PageNavSummary[]>;
  createRevision(data: {
    pageId: string;
    version: number;
    title: string;
    content: Prisma.InputJsonValue;
    authorId?: string;
  }): Promise<PageRevision>;
  findRevisions(pageId: string): Promise<PageRevision[]>;
  findRevisionByVersion(pageId: string, version: number): Promise<PageRevision | null>;
}

export class PrismaPagesRepository implements IPagesRepository {
  async create(data: CreatePageInput): Promise<Page> {
    return prisma.page.create({
      data: {
        slug: data.slug,
        type: data.type,
        title: data.title,
        content: (data.content ?? []) as unknown as Prisma.InputJsonValue,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        ogImage: data.ogImage,
        status: data.status ?? PageStatus.DRAFT,
      },
    });
  }

  async findById(id: string): Promise<Page | null> {
    return prisma.page.findUnique({
      where: { id },
    });
  }

  async findBySlug(slug: string): Promise<Page | null> {
    return prisma.page.findUnique({
      where: { slug },
    });
  }

  async update(
    id: string,
    data: UpdatePageInput & { version?: number; publishedAt?: Date | null },
  ): Promise<Page> {
    return prisma.page.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.content !== undefined && {
          content: data.content as unknown as Prisma.InputJsonValue,
        }),
        ...(data.metaTitle !== undefined && { metaTitle: data.metaTitle }),
        ...(data.metaDescription !== undefined && { metaDescription: data.metaDescription }),
        ...(data.ogImage !== undefined && { ogImage: data.ogImage }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.version !== undefined && { version: data.version }),
        ...(data.publishedAt !== undefined && { publishedAt: data.publishedAt }),
      },
    });
  }

  async delete(id: string): Promise<Page> {
    return prisma.page.delete({
      where: { id },
    });
  }

  async findAll(filter: PageFilterOptions): Promise<{ items: Page[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PageWhereInput = {
      ...(filter.type && { type: filter.type }),
      ...(filter.status && { status: filter.status }),
      ...(filter.search && {
        OR: [
          { title: { contains: filter.search, mode: 'insensitive' } },
          { slug: { contains: filter.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.page.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }],
      }),
      prisma.page.count({ where }),
    ]);

    return { items, total };
  }

  async findPublishedPagesNav(): Promise<PageNavSummary[]> {
    return prisma.page.findMany({
      where: { status: PageStatus.PUBLISHED },
      select: {
        slug: true,
        title: true,
        type: true,
      },
      orderBy: [{ type: 'asc' }, { title: 'asc' }],
    });
  }

  async createRevision(data: {
    pageId: string;
    version: number;
    title: string;
    content: Prisma.InputJsonValue;
    authorId?: string;
  }): Promise<PageRevision> {
    return prisma.pageRevision.create({
      data: {
        pageId: data.pageId,
        version: data.version,
        title: data.title,
        content: data.content,
        authorId: data.authorId,
      },
    });
  }

  async findRevisions(pageId: string): Promise<PageRevision[]> {
    return prisma.pageRevision.findMany({
      where: { pageId },
      orderBy: { version: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findRevisionByVersion(pageId: string, version: number): Promise<PageRevision | null> {
    return prisma.pageRevision.findFirst({
      where: { pageId, version },
    });
  }
}

export const pagesRepository = new PrismaPagesRepository();
