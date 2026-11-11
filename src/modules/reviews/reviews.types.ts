export type ReviewStatusType = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ReviewImageDto {
  id: string;
  url: string;
}

export interface ReviewDto {
  id: string;
  userId: string;
  productId: string;
  orderItemId: string | null;
  rating: number;
  title: string | null;
  comment: string;
  isVerifiedPurchase: boolean;
  status: ReviewStatusType;
  moderationReason: string | null;
  moderatedById: string | null;
  moderatedAt: Date | null;
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
  images: ReviewImageDto[];
}

export interface ProductRatingSummary {
  averageRating: number;
  totalReviews: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface PublicProductReviewsResult {
  summary: ProductRatingSummary;
  items: ReviewDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateReviewInput {
  rating: number;
  title?: string;
  comment: string;
  images?: string[];
}

export interface AdminReviewsQuery {
  page: number;
  limit: number;
  status?: ReviewStatusType;
  rating?: number;
  productId?: string;
  productSlug?: string;
  search?: string;
}

export interface UpdateReviewStatusInput {
  status: ReviewStatusType;
  reason?: string;
}

