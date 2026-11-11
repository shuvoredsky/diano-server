import sanitize from 'sanitize-html';
import { AppError } from '@/utils/app-error';
import { storageService, type FileInput, type StorageService } from '@/services/storage.service';
import { auditService, type IAuditService } from '@/services/audit.service';
import {
  notificationsService,
  type NotificationsService,
} from '@/modules/notifications/notifications.service';
import type { IReviewsRepository, ReviewWithRelations } from './reviews.repository';
import { reviewsRepository } from './reviews.repository';
import type {
  AdminReviewsQuery,
  CreateReviewInput,
  PublicProductReviewsResult,
  ReviewDto,
  UpdateReviewStatusInput,
} from './reviews.types';

/**
 * Strips all HTML tags, scripts, event handlers, and dangerous markup from user review text.
 */
export function sanitizeReviewText(dirty: string | null | undefined): string {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }
  return sanitize(dirty, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: [
      'script',
      'style',
      'textarea',
      'option',
      'noscript',
      'iframe',
      'object',
      'embed',
      'svg',
      'button',
    ],
    disallowedTagsMode: 'discard',
  }).trim();
}

export class ReviewsService {
  constructor(
    private readonly repo: IReviewsRepository = reviewsRepository,
    private readonly storage: StorageService = storageService,
    private readonly notifier: NotificationsService = notificationsService,
    private readonly auditSvc: IAuditService = auditService,
  ) {}

  private mapToDto(record: ReviewWithRelations): ReviewDto {
    return {
      id: record.id,
      userId: record.userId,
      productId: record.productId,
      orderItemId: record.orderItemId,
      rating: record.rating,
      title: record.title,
      comment: record.comment,
      isVerifiedPurchase: record.isVerifiedPurchase,
      status: record.status,
      moderationReason: record.moderationReason,
      moderatedById: record.moderatedById,
      moderatedAt: record.moderatedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      user: {
        id: record.user.id,
        name: record.user.name,
        avatarUrl: record.user.avatarUrl,
      },
      product: record.product
        ? {
            id: record.product.id,
            name: record.product.name,
            slug: record.product.slug,
          }
        : undefined,
      images: record.images.map(img => ({
        id: img.id,
        url: img.url,
      })),
    };
  }

  async createCustomerReview(params: {
    userId: string;
    productSlug: string;
    input: CreateReviewInput;
    uploadedFiles?: FileInput[];
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ReviewDto> {
    const product = await this.repo.findProductBySlug(params.productSlug);
    if (!product || product.status === 'ARCHIVED') {
      throw AppError.notFound('Product not found');
    }

    // 1. Check duplicate review (one review per user + product)
    const existing = await this.repo.findExistingReview(params.userId, product.id);
    if (existing) {
      throw AppError.conflict('You have already submitted a review for this product');
    }

    // 2. Verify delivered purchase
    const deliveredOrderItem = await this.repo.findDeliveredOrderItemForProduct(
      params.userId,
      product.id,
    );
    if (!deliveredOrderItem) {
      throw AppError.forbidden(
        'Verified purchase required: you can only review products from a delivered order',
      );
    }

    // 3. Sanitize title & comment (XSS prevention)
    const sanitizedComment = sanitizeReviewText(params.input.comment);
    if (!sanitizedComment || sanitizedComment.length < 2) {
      throw AppError.badRequest('Review comment contains no valid text after sanitization');
    }

    const sanitizedTitle = params.input.title
      ? sanitizeReviewText(params.input.title) || null
      : null;

    // 4. Process optional images (either uploaded via storage adapter or pre-uploaded URLs)
    const imageUrls: string[] = [...(params.input.images ?? [])];
    if (params.uploadedFiles && params.uploadedFiles.length > 0) {
      if (imageUrls.length + params.uploadedFiles.length > 5) {
        throw AppError.badRequest('A review cannot have more than 5 images');
      }
      for (const file of params.uploadedFiles) {
        const uploaded = await this.storage.uploadImage(file, 'reviews');
        imageUrls.push(uploaded.url);
      }
    }

    // 5. Persist review in PENDING status
    const created = await this.repo.createReview({
      userId: params.userId,
      productId: product.id,
      orderItemId: deliveredOrderItem.id,
      rating: params.input.rating,
      title: sanitizedTitle,
      comment: sanitizedComment,
      imageUrls,
    });

    // 6. Trigger admin notification hook via outbox queue
    await this.notifier.safeNotify({
      channel: 'IN_APP',
      recipient: 'admin',
      template: 'new_review_admin_alert',
      data: {
        reviewId: created.id,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        rating: created.rating,
        userId: params.userId,
      },
      dedupeKey: `review_submitted:${created.id}`,
    });

    // 7. Record audit log
    await this.auditSvc.record({
      actorId: params.userId,
      actorType: 'USER',
      action: 'REVIEW_SUBMITTED',
      targetType: 'Review',
      targetId: created.id,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        productId: product.id,
        productSlug: product.slug,
        rating: created.rating,
        orderItemId: deliveredOrderItem.id,
      },
    });

    return this.mapToDto(created);
  }

  async getPublicProductReviews(params: {
    productSlug: string;
    page: number;
    limit: number;
    rating?: number;
  }): Promise<PublicProductReviewsResult> {
    const product = await this.repo.findProductBySlug(params.productSlug);
    if (!product) {
      throw AppError.notFound('Product not found');
    }

    const { items, total, summary } = await this.repo.findPublicByProduct({
      productId: product.id,
      page: params.page,
      limit: params.limit,
      rating: params.rating,
    });

    const totalPages = Math.max(1, Math.ceil(total / params.limit));

    return {
      summary,
      items: items.map(item => this.mapToDto(item)),
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages,
      },
    };
  }

  async listAdminReviews(query: AdminReviewsQuery): Promise<{
    items: ReviewDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { items, total } = await this.repo.findAdminReviews(query);
    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      items: items.map(item => this.mapToDto(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  async getAdminReviewById(id: string): Promise<ReviewDto> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw AppError.notFound('Review not found');
    }
    return this.mapToDto(record);
  }

  async updateReviewStatus(params: {
    id: string;
    input: UpdateReviewStatusInput;
    actorId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ReviewDto> {
    const existing = await this.repo.findById(params.id);
    if (!existing) {
      throw AppError.notFound('Review not found');
    }

    const sanitizedReason = params.input.reason
      ? sanitizeReviewText(params.input.reason) || null
      : null;

    const updated = await this.repo.updateStatusAndRecalculate({
      id: params.id,
      productId: existing.productId,
      status: params.input.status,
      reason: sanitizedReason,
      moderatedById: params.actorId,
    });

    await this.auditSvc.record({
      actorId: params.actorId,
      actorType: 'USER',
      action: 'REVIEW_STATUS_UPDATED',
      targetType: 'Review',
      targetId: params.id,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        previousStatus: existing.status,
        newStatus: params.input.status,
        reason: sanitizedReason,
        productId: existing.productId,
      },
    });

    return this.mapToDto(updated);
  }

  async deleteReview(params: {
    id: string;
    actorId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const existing = await this.repo.findById(params.id);
    if (!existing) {
      throw AppError.notFound('Review not found');
    }

    await this.repo.softDeleteAndRecalculate({
      id: params.id,
      productId: existing.productId,
      moderatedById: params.actorId,
    });

    await this.auditSvc.record({
      actorId: params.actorId,
      actorType: 'USER',
      action: 'REVIEW_DELETED',
      targetType: 'Review',
      targetId: params.id,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        previousStatus: existing.status,
        productId: existing.productId,
      },
    });
  }
}

export const reviewsService = new ReviewsService();

