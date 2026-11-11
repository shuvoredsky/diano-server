import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewsService, sanitizeReviewText } from '@/modules/reviews/reviews.service';
import type { IReviewsRepository, ReviewWithRelations } from '@/modules/reviews/reviews.repository';
import type { StorageService } from '@/services/storage.service';
import type { NotificationsService } from '@/modules/notifications/notifications.service';
import type { IAuditService } from '@/services/audit.service';

describe('ReviewsService (Unit Tests)', () => {
  let service: ReviewsService;
  let mockRepo: vi.Mocked<IReviewsRepository>;
  let mockStorage: vi.Mocked<Pick<StorageService, 'uploadImage'>>;
  let mockNotifier: vi.Mocked<Pick<NotificationsService, 'safeNotify'>>;
  let mockAudit: vi.Mocked<IAuditService>;

  const createMockReview = (
    overrides: Partial<ReviewWithRelations> = {},
  ): ReviewWithRelations => ({
    id: 'rev_1',
    userId: 'user_1',
    productId: 'prod_1',
    orderItemId: 'oi_1',
    rating: 5,
    title: 'Great quality shirt',
    comment: 'Very comfortable cotton fabric and fast delivery.',
    isVerifiedPurchase: true,
    status: 'PENDING',
    moderationReason: null,
    moderatedById: null,
    moderatedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user_1',
      name: 'Customer One',
      avatarUrl: null,
    },
    product: {
      id: 'prod_1',
      name: 'Premium Panjabi',
      slug: 'premium-panjabi',
    },
    images: [],
    ...overrides,
  });

  beforeEach(() => {
    mockRepo = {
      findProductBySlug: vi.fn(),
      findExistingReview: vi.fn(),
      findDeliveredOrderItemForProduct: vi.fn(),
      createReview: vi.fn(),
      findPublicByProduct: vi.fn(),
      findAdminReviews: vi.fn(),
      findById: vi.fn(),
      updateStatusAndRecalculate: vi.fn(),
      softDeleteAndRecalculate: vi.fn(),
    };

    mockStorage = {
      uploadImage: vi.fn().mockResolvedValue({
        url: 'https://res.cloudinary.com/demo/image/upload/v1/reviews/img1.jpg',
        key: 'reviews/img1',
      }),
    };

    mockNotifier = {
      safeNotify: vi.fn().mockResolvedValue(null),
    };

    mockAudit = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new ReviewsService(
      mockRepo,
      mockStorage as unknown as StorageService,
      mockNotifier as unknown as NotificationsService,
      mockAudit,
    );
  });

  it('strips XSS scripts, event handlers, and HTML tags from review text', () => {
    const dirty = '<script>alert("xss")</script><img src=x onerror=alert(1)><b>Awesome</b> product!';
    expect(sanitizeReviewText(dirty)).toBe('Awesome product!');
  });

  it('rejects review creation when customer does not have a delivered order item for the product', async () => {
    mockRepo.findProductBySlug.mockResolvedValue({
      id: 'prod_1',
      name: 'Premium Panjabi',
      slug: 'premium-panjabi',
      status: 'PUBLISHED',
    });
    mockRepo.findExistingReview.mockResolvedValue(null);
    mockRepo.findDeliveredOrderItemForProduct.mockResolvedValue(null);

    await expect(
      service.createCustomerReview({
        userId: 'user_1',
        productSlug: 'premium-panjabi',
        input: {
          rating: 5,
          comment: 'Trying to review without delivered purchase',
        },
      }),
    ).rejects.toThrow('Verified purchase required');
  });

  it('rejects duplicate review for the same user and product', async () => {
    mockRepo.findProductBySlug.mockResolvedValue({
      id: 'prod_1',
      name: 'Premium Panjabi',
      slug: 'premium-panjabi',
      status: 'PUBLISHED',
    });
    mockRepo.findExistingReview.mockResolvedValue({ id: 'rev_existing', deletedAt: null });

    await expect(
      service.createCustomerReview({
        userId: 'user_1',
        productSlug: 'premium-panjabi',
        input: {
          rating: 4,
          comment: 'Duplicate review attempt',
        },
      }),
    ).rejects.toThrow('already submitted a review');
  });

  it('creates a PENDING verified review, sanitizes XSS, uploads optional images, and sends admin notification', async () => {
    mockRepo.findProductBySlug.mockResolvedValue({
      id: 'prod_1',
      name: 'Premium Panjabi',
      slug: 'premium-panjabi',
      status: 'PUBLISHED',
    });
    mockRepo.findExistingReview.mockResolvedValue(null);
    mockRepo.findDeliveredOrderItemForProduct.mockResolvedValue({
      id: 'oi_delivered_1',
      orderId: 'ord_1',
    });
    mockRepo.createReview.mockImplementation(async params =>
      createMockReview({
        title: params.title,
        comment: params.comment,
        images: params.imageUrls.map((url, idx) => ({ id: `img_${idx}`, url })),
      }),
    );

    const created = await service.createCustomerReview({
      userId: 'user_1',
      productSlug: 'premium-panjabi',
      input: {
        rating: 5,
        title: '<script>bad()</script>Best Panjabi',
        comment: 'Loved the stitching! <iframe src="evil"></iframe>',
      },
      uploadedFiles: [
        {
          buffer: Buffer.from('fake'),
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
        },
      ],
    });

    expect(created.status).toBe('PENDING');
    expect(created.isVerifiedPurchase).toBe(true);
    expect(created.title).toBe('Best Panjabi');
    expect(created.comment).toBe('Loved the stitching!');
    expect(created.images).toHaveLength(1);
    expect(mockNotifier.safeNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'new_review_admin_alert',
      }),
    );
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REVIEW_SUBMITTED',
      }),
    );
  });

  it('moderates review status and triggers product rating recalculation', async () => {
    mockRepo.findById.mockResolvedValue(createMockReview({ status: 'PENDING' }));
    mockRepo.updateStatusAndRecalculate.mockResolvedValue(
      createMockReview({
        status: 'APPROVED',
        moderationReason: 'Verified authentic review',
        moderatedById: 'admin_1',
      }),
    );

    const updated = await service.updateReviewStatus({
      id: 'rev_1',
      input: { status: 'APPROVED', reason: 'Verified authentic review' },
      actorId: 'admin_1',
    });

    expect(updated.status).toBe('APPROVED');
    expect(updated.moderationReason).toBe('Verified authentic review');
    expect(mockRepo.updateStatusAndRecalculate).toHaveBeenCalledWith({
      id: 'rev_1',
      productId: 'prod_1',
      status: 'APPROVED',
      reason: 'Verified authentic review',
      moderatedById: 'admin_1',
    });
  });
});

