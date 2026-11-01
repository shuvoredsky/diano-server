import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { inventoryService } from './inventory.service';
import {
  receiveStockSchema,
  adjustStockSchema,
  damageStockSchema,
  transferStockSchema,
  inventoryFilterQuerySchema,
  stockMovementQuerySchema,
} from './inventory.validation';
import { getPaginationMeta } from '@/utils/pagination';
import { permissionsCache } from '@/modules/permissions/permissions.cache';

export class InventoryController {
  constructor(private readonly service = inventoryService) {}

  listInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = inventoryFilterQuerySchema.parse(req.query);
      const { items, total } = await this.service.listInventory(query);

      ApiResponse.paginated(
        res,
        'Inventory items retrieved successfully',
        items,
        getPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
      );
    } catch (err) {
      next(err);
    }
  };

  getInventoryByVariant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const variantId = req.params.variantId as string;
      const warehouseId = req.query.warehouseId as string | undefined;
      const items = await this.service.getInventoryByVariant(variantId, warehouseId);

      ApiResponse.success(res, 'Variant inventory retrieved successfully', items);
    } catch (err) {
      next(err);
    }
  };

  receiveStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = receiveStockSchema.parse(req.body);
      const result = await this.service.receiveStock({
        ...body,
        actorId: req.user?.userId,
      });

      ApiResponse.success(res, 'Stock received successfully', result);
    } catch (err) {
      next(err);
    }
  };

  adjustStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = adjustStockSchema.parse(req.body);
      const result = await this.service.adjustStock({
        ...body,
        actorId: req.user?.userId as string,
      });

      ApiResponse.success(res, 'Stock adjusted successfully', result);
    } catch (err) {
      next(err);
    }
  };

  markDamaged = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = damageStockSchema.parse(req.body);
      const result = await this.service.markDamaged({
        ...body,
        actorId: req.user?.userId as string,
      });

      ApiResponse.success(res, 'Stock marked as damaged successfully', result);
    } catch (err) {
      next(err);
    }
  };

  transferStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = transferStockSchema.parse(req.body);
      const result = await this.service.transferStock({
        ...body,
        actorId: req.user?.userId,
      });

      ApiResponse.success(res, 'Stock transferred successfully', result);
    } catch (err) {
      next(err);
    }
  };

  listMovements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = stockMovementQuerySchema.parse(req.query);
      const { items, total } = await this.service.listMovements(query);

      ApiResponse.paginated(
        res,
        'Stock movements retrieved successfully',
        items,
        getPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
      );
    } catch (err) {
      next(err);
    }
  };

  listLowStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const warehouseId = req.query.warehouseId as string | undefined;

      const { items, total } = await this.service.listLowStock(warehouseId, page, limit);

      ApiResponse.paginated(
        res,
        'Low stock variants retrieved successfully',
        items,
        getPaginationMeta(total, page, limit),
      );
    } catch (err) {
      next(err);
    }
  };

  getSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const warehouseId = req.query.warehouseId as string | undefined;
      const userRoles = req.user?.roles ?? [];

      const hasCostPermission =
        userRoles.includes('super-admin') ||
        userRoles.includes('SUPER_ADMIN') ||
        (await permissionsCache.hasPermission(userRoles, 'inventory:view_cost'));

      const summary = await this.service.getSummary(hasCostPermission, warehouseId);

      ApiResponse.success(res, 'Inventory summary metrics retrieved successfully', summary);
    } catch (err) {
      next(err);
    }
  };
}

export const inventoryController = new InventoryController();
