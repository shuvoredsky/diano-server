import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { getPagination } from '@/utils/pagination';
import { abandonedCheckoutService } from './abandoned-checkout.service';
import type { NotificationChannel } from './abandoned-checkout.types';

export class AbandonedCheckoutController {
  constructor(private readonly service = abandonedCheckoutService) {}

  getAbandonedCheckouts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = getPagination({
        page: req.query.page as string,
        limit: req.query.limit as string,
      });
      const status = req.query.status as string | undefined;
      const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
      const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;
      const minValue = req.query.minValue ? Number(req.query.minValue) : undefined;
      const maxValue = req.query.maxValue ? Number(req.query.maxValue) : undefined;

      const result = await this.service.getAbandonedCheckouts({
        status,
        fromDate,
        toDate,
        minValue,
        maxValue,
        page,
        limit,
      });

      ApiResponse.paginated(
        res,
        'Abandoned checkouts retrieved successfully',
        result.items,
        result.pagination,
      );
    } catch (err) {
      next(err);
    }
  };

  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
      const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;
      const timezone = (req.query.timezone as string) || 'Asia/Dhaka';

      const stats = await this.service.getStats({
        fromDate,
        toDate,
        timezone,
      });

      ApiResponse.success(res, 'Abandoned checkout statistics calculated successfully', stats);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const actor = req.user
        ? {
            userId: req.user.userId,
            sessionId: req.user.sessionId,
            roles: req.user.roles,
            ipAddress: req.ip,
          }
        : undefined;

      const detail = await this.service.getAbandonedCheckoutById(id, actor);
      ApiResponse.success(res, 'Abandoned checkout details retrieved successfully', detail);
    } catch (err) {
      next(err);
    }
  };

  triggerRecovery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const channel = (req.body.channel as NotificationChannel) || 'SMS';

      const result = await this.service.triggerRecovery(id, channel);
      ApiResponse.success(res, result.message, result);
    } catch (err) {
      next(err);
    }
  };
}

export const abandonedCheckoutController = new AbandonedCheckoutController();
