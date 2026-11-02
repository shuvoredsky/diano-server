import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { returnsService, type ReturnsService } from './returns.service';
import {
  createReturnRequestSchema,
  reviewReturnSchema,
  receiveReturnSchema,
  returnFilterSchema,
} from './returns.validation';

export class ReturnsController {
  constructor(private readonly service: ReturnsService = returnsService) {}

  // ==========================================
  // CUSTOMER RETURN ENDPOINTS
  // ==========================================

  requestReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const parsed = createReturnRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid return request payload', parsed.error.format());
      }

      const returnReq = await this.service.requestReturn(
        orderId,
        parsed.data,
        req.user.userId,
      );

      ApiResponse.created(res, 'Return request submitted successfully', returnReq);
    } catch (error) {
      next(error);
    }
  };

  getMyReturns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const returns = await this.service.getCustomerReturns(req.user.userId);
      ApiResponse.success(res, 'Customer return requests retrieved successfully', returns);
    } catch (error) {
      next(error);
    }
  };

  listReturnReasons = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reasons = await this.service.listReturnReasons();
      ApiResponse.success(res, 'Return reasons retrieved successfully', reasons);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // ADMIN RETURN ENDPOINTS
  // ==========================================

  listReturns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = returnFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid filter query parameters', parsed.error.format());
      }

      const { items, total } = await this.service.listReturns(parsed.data);
      const page = parsed.data.page ?? 1;
      const limit = parsed.data.limit ?? 20;
      const totalPages = Math.ceil(total / limit) || 1;

      ApiResponse.paginated(res, 'Return requests retrieved successfully', items, {
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

  getReturnById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const returnReq = await this.service.getReturnById(id);
      ApiResponse.success(res, 'Return request detail retrieved successfully', returnReq);
    } catch (error) {
      next(error);
    }
  };

  reviewReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const parsed = reviewReturnSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid review payload', parsed.error.format());
      }

      const updated = await this.service.reviewReturn(id, parsed.data, { id: req.user.userId });
      ApiResponse.success(res, `Return request ${parsed.data.action.toLowerCase()}ed successfully`, updated);
    } catch (error) {
      next(error);
    }
  };

  receiveAndInspectReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const parsed = receiveReturnSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid inspection payload', parsed.error.format());
      }

      const updated = await this.service.receiveAndInspectReturn(id, parsed.data, {
        id: req.user.userId,
      });

      ApiResponse.success(
        res,
        'Returned items inspected and restocked successfully',
        updated,
      );
    } catch (error) {
      next(error);
    }
  };
}

export const returnsController = new ReturnsController();
