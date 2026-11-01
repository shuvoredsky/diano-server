import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { stockAuditService } from './stock-audit.service';
import { z } from 'zod';

export const startAuditSchema = z.object({
  warehouseId: z.string().trim().min(1, 'Warehouse ID is required'),
  notes: z.string().trim().max(500).optional(),
});

export const recordAuditCountsSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().trim().min(1, 'Variant ID is required'),
        countedQuantity: z.number().int().nonnegative('Counted quantity cannot be negative'),
        notes: z.string().trim().max(300).optional(),
      }),
    )
    .min(1, 'At least one item count is required'),
});

export class StockAuditController {
  constructor(private readonly service = stockAuditService) {}

  startAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = startAuditSchema.parse(req.body);
      const audit = await this.service.startAudit({
        ...body,
        auditorId: req.user?.userId as string,
      });

      ApiResponse.success(res, 'Stock audit started successfully', audit, 201);
    } catch (err) {
      next(err);
    }
  };

  listAudits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const warehouseId = req.query.warehouseId as string | undefined;
      const audits = await this.service.listAudits(warehouseId);

      ApiResponse.success(res, 'Stock audits retrieved successfully', audits);
    } catch (err) {
      next(err);
    }
  };

  getAuditById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const audit = await this.service.getAuditById(id);

      ApiResponse.success(res, 'Stock audit retrieved successfully', audit);
    } catch (err) {
      next(err);
    }
  };

  recordCounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const body = recordAuditCountsSchema.parse(req.body);
      const audit = await this.service.recordCounts(
        {
          auditId: id,
          items: body.items,
        },
        req.user?.userId,
      );

      ApiResponse.success(res, 'Stock audit counts recorded successfully', audit);
    } catch (err) {
      next(err);
    }
  };

  approveAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const audit = await this.service.approveAudit(id, req.user?.userId as string);

      ApiResponse.success(res, 'Stock audit approved and discrepancies reconciled via ledger', audit);
    } catch (err) {
      next(err);
    }
  };

  rejectAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const reason = req.body.reason as string | undefined;
      const audit = await this.service.rejectAudit(id, req.user?.userId as string, reason);

      ApiResponse.success(res, 'Stock audit rejected', audit);
    } catch (err) {
      next(err);
    }
  };
}

export const stockAuditController = new StockAuditController();
