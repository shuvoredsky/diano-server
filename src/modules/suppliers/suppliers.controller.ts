import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { getPaginationMeta } from '@/utils/pagination';
import { suppliersService } from './suppliers.service';
import {
  createSupplierSchema,
  updateSupplierSchema,
  supplierFilterQuerySchema,
} from './suppliers.validation';

export class SuppliersController {
  constructor(private readonly service = suppliersService) {}

  listSuppliers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = supplierFilterQuerySchema.parse(req.query);
      const { items, total } = await this.service.listSuppliers(query);

      ApiResponse.paginated(
        res,
        'Suppliers retrieved successfully',
        items,
        getPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
      );
    } catch (err) {
      next(err);
    }
  };

  getSupplierById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const supplier = await this.service.getSupplierById(id);

      ApiResponse.success(res, 'Supplier retrieved successfully', supplier);
    } catch (err) {
      next(err);
    }
  };

  createSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createSupplierSchema.parse(req.body);
      const supplier = await this.service.createSupplier(body, {
        userId: req.user?.userId as string,
        email: req.user?.email,
      });

      ApiResponse.success(res, 'Supplier created successfully', supplier, 201);
    } catch (err) {
      next(err);
    }
  };

  updateSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const body = updateSupplierSchema.parse(req.body);
      const supplier = await this.service.updateSupplier(id, body, {
        userId: req.user?.userId as string,
        email: req.user?.email,
      });

      ApiResponse.success(res, 'Supplier updated successfully', supplier);
    } catch (err) {
      next(err);
    }
  };

  deleteSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const supplier = await this.service.deleteSupplier(id, {
        userId: req.user?.userId as string,
        email: req.user?.email,
      });

      ApiResponse.success(res, 'Supplier deleted successfully', supplier);
    } catch (err) {
      next(err);
    }
  };
}

export const suppliersController = new SuppliersController();
