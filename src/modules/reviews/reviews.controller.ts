import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { getPaginationMeta } from '@/utils/pagination';
import type { FileInput } from '@/services/storage.service';
import { reviewsService, type ReviewsService } from './reviews.service';
import {
  createReviewSchema,
  publicProductReviewsQuerySchema,
  adminListReviewsQuerySchema,
  updateReviewStatusSchema,
  reviewIdParamSchema,
  productSlugParamSchema,
} from './reviews.validation';

export class ReviewsController {
  constructor(private readonly service: ReviewsService = reviewsService) {}

  createCustomerReview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw AppError.unauthorized('Authentication required to submit a review');
      }

      const { slug } = productSlugParamSchema.parse(req.params);
      const input = createReviewSchema.parse(req.body);

      const multerFiles = Array.isArray(req.files)
        ? (req.files as Express.Multer.File[])
        : [];
      const uploadedFiles: FileInput[] = multerFiles.map(f => ({
        buffer: f.buffer,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      }));

      const review = await this.service.createCustomerReview({
        userId,
        productSlug: slug,
        input,
        uploadedFiles,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      ApiResponse.created(
        res,
        'Review submitted successfully and is pending moderation',
        review,
      );
    } catch (error) {
      next(error);
    }
  };

  listPublicProductReviews = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { slug } = productSlugParamSchema.parse(req.params);
      const query = publicProductReviewsQuerySchema.parse(req.query);

      const result = await this.service.getPublicProductReviews({
        productSlug: slug,
        page: query.page,
        limit: query.limit,
        rating: query.rating,
      });

      ApiResponse.success(
        res,
        'Product reviews retrieved successfully',
        result,
        200,
        {
          pagination: getPaginationMeta(
            result.meta.total,
            result.meta.page,
            result.meta.limit,
          ),
          summary: result.summary,
        },
      );
    } catch (error) {
      next(error);
    }
  };

  listAdminReviews = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = adminListReviewsQuerySchema.parse(req.query);
      const result = await this.service.listAdminReviews(query);

      ApiResponse.paginated(
        res,
        'Reviews retrieved successfully',
        result.items,
        getPaginationMeta(result.meta.total, result.meta.page, result.meta.limit),
      );
    } catch (error) {
      next(error);
    }
  };

  getAdminReviewById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = reviewIdParamSchema.parse(req.params);
      const review = await this.service.getAdminReviewById(id);

      ApiResponse.success(res, 'Review retrieved successfully', review);
    } catch (error) {
      next(error);
    }
  };

  updateReviewStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = reviewIdParamSchema.parse(req.params);
      const input = updateReviewStatusSchema.parse(req.body);
      const actorId = req.user?.userId || 'system';

      const updated = await this.service.updateReviewStatus({
        id,
        input,
        actorId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      ApiResponse.success(res, 'Review moderation status updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  deleteReview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = reviewIdParamSchema.parse(req.params);
      const actorId = req.user?.userId || 'system';

      await this.service.deleteReview({
        id,
        actorId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      ApiResponse.success(res, 'Review deleted successfully');
    } catch (error) {
      next(error);
    }
  };
}

export const reviewsController = new ReviewsController();

