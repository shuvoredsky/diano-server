import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { getPaginationMeta } from '@/utils/pagination';
import { purchaseOrdersService } from './purchase-orders.service';
import {
  createPurchaseOrderSchema,
  updatePoStatusSchema,
  receivePurchaseOrderSchema,
  purchaseOrderFilterQuerySchema,
} from './purchase-orders.validation';

export class PurchaseOrdersController {
  constructor(private readonly service = purchaseOrdersService) {}

  listPurchaseOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = purchaseOrderFilterQuerySchema.parse(req.query);
      const { items, total } = await this.service.listPurchaseOrders(query);

      ApiResponse.paginated(
        res,
        'Purchase orders retrieved successfully',
        items,
        getPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
      );
    } catch (err) {
      next(err);
    }
  };

  getPurchaseOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const po = await this.service.getPurchaseOrderById(id);

      ApiResponse.success(res, 'Purchase order retrieved successfully', po);
    } catch (err) {
      next(err);
    }
  };

  createPurchaseOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createPurchaseOrderSchema.parse(req.body);
      const po = await this.service.createPurchaseOrder(body, {
        userId: req.user?.userId as string,
        email: req.user?.email,
      });

      ApiResponse.success(res, 'Purchase order created successfully', po, 201);
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const body = updatePoStatusSchema.parse(req.body);
      const po = await this.service.updateStatus(id, body.status, {
        userId: req.user?.userId as string,
        email: req.user?.email,
      });

      ApiResponse.success(res, 'Purchase order status updated successfully', po);
    } catch (err) {
      next(err);
    }
  };

  receivePoItems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const body = receivePurchaseOrderSchema.parse(req.body);
      const po = await this.service.receivePoItems(id, body, {
        userId: req.user?.userId as string,
        email: req.user?.email,
      });

      ApiResponse.success(res, 'Goods received and inventory updated successfully', po);
    } catch (err) {
      next(err);
    }
  };
}

export const purchaseOrdersController = new PurchaseOrdersController();
