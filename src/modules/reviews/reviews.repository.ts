import { prisma } from '@/config/database';
import type { Prisma, ReviewStatus } from '@prisma/client';
import type {
  AdminReviewsQuery,
  ProductRatingSummary,
  ReviewStatusType,
} from './reviews.types';

export interface ReviewWithRelations {
  id: string;
  userId: string;
  productId: string;
  orderItemId: string | null;
  rating: number;
  title: string | null;
  comment: string;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  moderationReason: string | null;
  moderatedById: string | null;
  moderatedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  product?: {
    id: string;
    name: string;
    slug: string;
  };
  images: Array<{
    id: string;
    url: string;
  }>;
}

export interface IReviewsRepository {
  findProductBySlug(slug: string): Promise<{
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null>;
  findExistingReview(
    userId: string,
    productId: string,
  ): Promise<{ id: string; deletedAt: Date | null } | null>;
  findDeliveredOrderItemForProduct(
    userId: string,
    productId: string,
  ): Promise<{ id: string; orderId: string } | null>;
  createReview(params: {
    userId: string;
    productId: string;
    orderItemId: string;
    rating: number;
    title: string | null;
    comment: string;
    imageUrls: string[];
  }): Promise<ReviewWithRelations>;
  findPublicByProduct(params: {
    productId: string;
    page: number;
    limit: number;
    rating?: number;
  }): Promise<{
    items: ReviewWithRelations[];
    total: number;
    summary: ProductRatingSummary;
  }>;
  findAdminReviews(query: AdminReviewsQuery): Promise<{
    items: ReviewWithRelations[];
    total: number;
  }>;
  findById(id: string): Promise<ReviewWithRelations | null>;
  updateStatusAndRecalculate(params: {
    id: string;
    productId: string;
    status: ReviewStatusType;
    reason?: string | null;
    moderatedById: string;
  }): Promise<ReviewWithRelations>;
  softDeleteAndRecalculate(params: {
    id: string;
    productId: string;
    moderatedById: string;
  }): Promise<void>;
}

const reviewSelectInclude = {
  user: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  images: {
    select: {
      id: true,
      url: true,
    },
  },
} as const;

async function recalculateProductRatingInTx(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> {
  const aggregate = await tx.review.aggregate({
    where: {
      productId,
      status: 'APPROVED',
      deletedAt: null,
    },
    _avg: {
      rating: true,
    },
    _count: {
      id: true,
    },
  });

  const avgRating = aggregate._avg.rating
    ? Number(aggregate._avg.rating.toFixed(2))
    : 0;
  const reviewCount = aggregate._count.id;

  await tx.product.update({
    where: { id: productId },
    data: {
      averageRating: avgRating,
      reviewCount,
    },
  });
}

export class PrismaReviewsRepository implements IReviewsRepository {
  async findProductBySlug(slug: string) {
    return prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
      },
    });
  }

  async findExistingReview(userId: string, productId: string) {
    return prisma.review.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });
  }

  async findDeliveredOrderItemForProduct(userId: string, productId: string) {
    return prisma.orderItem.findFirst({
      where: {
        variant: {
          productId,
        },
        order: {
          customerId: userId,
          status: 'DELIVERED',
        },
      },
      orderBy: {
        order: {
          createdAt: 'desc',
        },
      },
      select: {
        id: true,
        orderId: true,
      },
    });
  }

  async createReview(params: {
    userId: string;
    productId: string;
    orderItemId: string;
    rating: number;
    title: string | null;
    comment: string;
    imageUrls: string[];
  }): Promise<ReviewWithRelations> {
    return prisma.review.create({
      data: {
        userId: params.userId,
        productId: params.productId,
        orderItemId: params.orderItemId,
        rating: params.rating,
        title: params.title,
        comment: params.comment,
        isVerifiedPurchase: true,
        status: 'PENDING',
        images:
          params.imageUrls.length > 0
            ? {
                create: params.imageUrls.map(url => ({ url })),
              }
            : undefined,
      },
      include: reviewSelectInclude,
    });
  }

  async findPublicByProduct(params: {
    productId: string;
    page: number;
    limit: number;
    rating?: number;
  }) {
    const baseApprovedWhere: Prisma.ReviewWhereInput = {
      productId: params.productId,
      status: 'APPROVED',
      deletedAt: null,
    };

    const listWhere: Prisma.ReviewWhereInput = {
      ...baseApprovedWhere,
      ...(params.rating ? { rating: params.rating } : {}),
    };

    const skip = (params.page - 1) * params.limit;

    const [items, total, groupedRatings] = await Promise.all([
      prisma.review.findMany({
        where: listWhere,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: reviewSelectInclude,
      }),
      prisma.review.count({ where: listWhere }),
      prisma.review.groupBy({
        by: ['rating'],
        where: baseApprovedWhere,
        _count: {
          rating: true,
        },
      }),
    ]);

    const distribution: ProductRatingSummary['distribution'] = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    let totalApprovedCount = 0;
    let weightedRatingSum = 0;

    for (const group of groupedRatings) {
      const r = group.rating as 1 | 2 | 3 | 4 | 5;
      const count = group._count.rating;
      if (r >= 1 && r <= 5) {
        distribution[r] = count;
        totalApprovedCount += count;
        weightedRatingSum += r * count;
      }
    }

    const averageRating =
      totalApprovedCount > 0
        ? Number((weightedRatingSum / totalApprovedCount).toFixed(2))
        : 0;

    return {
      items,
      total,
      summary: {
        averageRating,
        totalReviews: totalApprovedCount,
        distribution,
      },
    };
  }

  async findAdminReviews(query: AdminReviewsQuery) {
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.rating) {
      where.rating = query.rating;
    }

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.productSlug) {
      where.product = {
        slug: query.productSlug,
      };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { comment: { contains: query.search, mode: 'insensitive' } },
        { user: { name: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: reviewSelectInclude,
      }),
      prisma.review.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string) {
    return prisma.review.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: reviewSelectInclude,
    });
  }

  async updateStatusAndRecalculate(params: {
    id: string;
    productId: string;
    status: ReviewStatusType;
    reason?: string | null;
    moderatedById: string;
  }): Promise<ReviewWithRelations> {
    return prisma.$transaction(async tx => {
      const updated = await tx.review.update({
        where: { id: params.id },
        data: {
          status: params.status,
          moderationReason: params.reason ?? null,
          moderatedById: params.moderatedById,
          moderatedAt: new Date(),
        },
        include: reviewSelectInclude,
      });

      await recalculateProductRatingInTx(tx, params.productId);

      return updated;
    });
  }

  async softDeleteAndRecalculate(params: {
    id: string;
    productId: string;
    moderatedById: string;
  }): Promise<void> {
    await prisma.$transaction(async tx => {
      await tx.review.update({
        where: { id: params.id },
        data: {
          deletedAt: new Date(),
          moderatedById: params.moderatedById,
          moderatedAt: new Date(),
        },
      });

      await recalculateProductRatingInTx(tx, params.productId);
    });
  }
}

export const reviewsRepository = new PrismaReviewsRepository();

