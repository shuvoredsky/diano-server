import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { prisma } from '@/config/database';
import { refundsService, type RefundsService } from './refunds.service';
import {
  executeRefundSchema,
  refundFilterSchema,
} from './refunds.validation';

export class RefundsController {
  constructor(private readonly service: RefundsService = refundsService) {}

  listRefunds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = refundFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid refund filter query', parsed.error.format());
      }

      const { items, total } = await this.service.listRefunds(parsed.data);
      const page = parsed.data.page ?? 1;
      const limit = parsed.data.limit ?? 20;
      const totalPages = Math.ceil(total / limit) || 1;

      ApiResponse.paginated(res, 'Refund records retrieved successfully', items, {
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

  getRefundById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const refund = await this.service.getRefundById(id);
      ApiResponse.success(res, 'Refund detail retrieved successfully', refund);
    } catch (error) {
      next(error);
    }
  };

  executeOrderRefund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const parsed = executeRefundSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid refund payload', parsed.error.format());
      }

      const idempotencyKey =
        (req.headers['idempotency-key'] as string) ||
        (req.body?.idempotencyKey as string) ||
        undefined;

      const refund = await this.service.executeRefund(
        {
          ...parsed.data,
          orderId,
          idempotencyKey,
        },
        { id: req.user.userId },
      );

      ApiResponse.created(res, 'Refund executed and recorded successfully', refund);
    } catch (error) {
      next(error);
    }
  };

  executeReturnRefund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const returnRequestId = req.params.id as string;
      const parsed = executeRefundSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid refund payload', parsed.error.format());
      }

      const returnReq = await prisma.returnRequest.findUnique({
        where: { id: returnRequestId },
      });
      if (!returnReq) throw AppError.notFound(`Return request '${returnRequestId}' not found`);

      const idempotencyKey =
        (req.headers['idempotency-key'] as string) ||
        (req.body?.idempotencyKey as string) ||
        undefined;

      const refund = await this.service.executeRefund(
        {
          ...parsed.data,
          orderId: returnReq.orderId,
          returnRequestId,
          amount: parsed.data.amount || (returnReq.refundAmount ? returnReq.refundAmount.toString() : undefined),
          idempotencyKey,
        },
        { id: req.user.userId },
      );

      ApiResponse.created(res, 'Return request refund processed successfully', refund);
    } catch (error) {
      next(error);
    }
  };
}

export const refundsController = new RefundsController();
