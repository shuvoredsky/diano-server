import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { fraudService, type FraudService } from './fraud.service';
import {
  updateFraudRuleSchema,
  fraudReviewFilterSchema,
  rejectFraudReviewSchema,
  approveFraudReviewSchema,
  verifyFraudOtpSchema,
} from './fraud.validation';

export class FraudController {
  constructor(private readonly service: FraudService = fraudService) {}

  private async resolveUserPermissions(req: Request): Promise<string[]> {
    if (!req.user) return [];
    const isSuperAdmin =
      req.user.roles.includes('super-admin') ||
      req.user.roles.includes('SUPER_ADMIN') ||
      req.user.roles.includes('admin') ||
      req.user.roles.includes('ADMIN');

    if (isSuperAdmin) {
      return ['*'];
    }

    const permSet = await permissionsCache.getRolePermissions(req.user.roles);
    return Array.from(permSet);
  }

  getRules = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rules = await this.service.getRules();
      ApiResponse.success(res, 'Fraud rules retrieved successfully', rules);
    } catch (error) {
      next(error);
    }
  };

  updateRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const key = req.params.key as string;
      const parsed = updateFraudRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid rule update payload', parsed.error.format());
      }

      const updated = await this.service.updateRule(key, parsed.data, { id: req.user.userId });
      ApiResponse.success(res, 'Fraud rule updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  listReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = fraudReviewFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid filter query parameters', parsed.error.format());
      }

      const { items, total, page, limit } = await this.service.listReviews(parsed.data);
      const totalPages = Math.ceil(total / limit) || 1;

      ApiResponse.paginated(res, 'Fraud reviews retrieved successfully', items, {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      });
    } catch (error) {
      next(error);
    }
  };

  getReviewDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const review = await this.service.getReviewDetail(id);
      ApiResponse.success(res, 'Fraud review detail retrieved successfully', review);
    } catch (error) {
      next(error);
    }
  };

  approveReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const parsed = approveFraudReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid payload', parsed.error.format());
      }

      const updated = await this.service.approveReview(id, { id: req.user.userId }, parsed.data);
      ApiResponse.success(res, 'Order verification approved successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  rejectReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const parsed = rejectFraudReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid rejection payload', parsed.error.format());
      }

      const permissions = await this.resolveUserPermissions(req);
      const updated = await this.service.rejectReview(
        id,
        { id: req.user.userId, permissions },
        parsed.data.reason,
      );
      ApiResponse.success(res, 'Order verification rejected and order cancelled', updated);
    } catch (error) {
      next(error);
    }
  };

  requestOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const result = await this.service.requestOtp(id, { id: req.user.userId });
      ApiResponse.success(res, result.message, result);
    } catch (error) {
      next(error);
    }
  };

  verifyOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const parsed = verifyFraudOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid verification code payload', parsed.error.format());
      }

      const result = await this.service.verifyOtp(id, parsed.data.code, { id: req.user.userId });
      ApiResponse.success(res, result.message, result.assessment);
    } catch (error) {
      next(error);
    }
  };

  getStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await this.service.getStats();
      ApiResponse.success(res, 'Fraud statistics retrieved successfully', stats);
    } catch (error) {
      next(error);
    }
  };
}

export const fraudController = new FraudController();
