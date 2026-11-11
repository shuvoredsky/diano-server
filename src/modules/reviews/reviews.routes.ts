import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { handleUploadMultiple } from '@/middlewares/upload.middleware';
import { reviewsController } from './reviews.controller';

export const adminReviewsRouter = Router();

export const optionalReviewImagesUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.is('multipart/form-data')) {
    handleUploadMultiple('images', 5)(req, res, next);
    return;
  }
  next();
};

// Admin Reviews Moderation Routes
adminReviewsRouter.get(
  '/',
  authenticate,
  requirePermission('review:read', 'review:moderate'),
  reviewsController.listAdminReviews,
);

adminReviewsRouter.get(
  '/:id',
  authenticate,
  requirePermission('review:read', 'review:moderate'),
  reviewsController.getAdminReviewById,
);

adminReviewsRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('review:moderate'),
  reviewsController.updateReviewStatus,
);

adminReviewsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('review:moderate'),
  reviewsController.deleteReview,
);

