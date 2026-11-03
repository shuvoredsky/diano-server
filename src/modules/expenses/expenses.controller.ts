import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { getPaginationMeta } from '@/utils/pagination';
import { expensesService, type ExpensesService } from './expenses.service';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseFilterSchema,
} from './expenses.validation';

export class ExpensesController {
  constructor(private readonly service: ExpensesService = expensesService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = createExpenseSchema.parse(req.body);
      const actorId = req.user?.userId || 'system';

      const expense = await this.service.create(
        {
          ...data,
          createdBy: actorId,
        },
        {
          id: actorId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.headers['x-request-id'] as string | undefined,
        },
      );

      ApiResponse.created(res, 'Expense created successfully', expense);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const expense = await this.service.getById(id);
      ApiResponse.success(res, 'Expense retrieved successfully', expense);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = updateExpenseSchema.parse(req.body);
      const actorId = req.user?.userId || 'system';

      const expense = await this.service.update(id, data, {
        id: actorId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'] as string | undefined,
      });

      ApiResponse.success(res, 'Expense updated successfully', expense);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const actorId = req.user?.userId || 'system';

      await this.service.delete(id, {
        id: actorId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'] as string | undefined,
      });

      ApiResponse.success(res, 'Expense deleted successfully');
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = expenseFilterSchema.parse(req.query);
      const { items, total } = await this.service.list(filter);

      const page = filter.page ?? 1;
      const limit = filter.limit ?? 20;

      ApiResponse.paginated(
        res,
        'Expenses retrieved successfully',
        items,
        getPaginationMeta(total, page, limit),
      );
    } catch (error) {
      next(error);
    }
  };
}

export const expensesController = new ExpensesController();
