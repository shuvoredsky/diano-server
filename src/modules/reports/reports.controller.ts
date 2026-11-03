import type { Request, Response, NextFunction } from 'express';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { reportsService, type ReportsService } from './reports.service';
import {
  ordersReportSchema,
  salesReportSchema,
  inventoryReportSchema,
  customersReportSchema,
  financialReportSchema,
} from './reports.validation';
import type { ReportContext } from './reports.types';

export class ReportsController {
  constructor(private readonly service: ReportsService = reportsService) {}

  private async buildContext(req: Request): Promise<ReportContext> {
    const roles = req.user?.roles || [];
    const isSuperAdmin = roles.some(
      r => r.toLowerCase() === 'super-admin' || r.toLowerCase() === 'super_admin',
    );

    const [canViewFinance, canExportPii] = await Promise.all([
      isSuperAdmin || permissionsCache.hasPermission(roles, 'analytics:view_finance'),
      isSuperAdmin || permissionsCache.hasPermission(roles, 'report:export_pii'),
    ]);

    return {
      userId: req.user?.userId || 'system',
      userRoles: roles,
      canViewFinance,
      canExportPii,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.headers['x-request-id'] as string | undefined,
    };
  }

  exportOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = ordersReportSchema.parse(req.body);
      const ctx = await this.buildContext(req);
      await this.service.exportOrders(filters, ctx, res);
    } catch (error) {
      next(error);
    }
  };

  exportSales = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = salesReportSchema.parse(req.body);
      const ctx = await this.buildContext(req);
      await this.service.exportSales(filters, ctx, res);
    } catch (error) {
      next(error);
    }
  };

  exportInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = inventoryReportSchema.parse(req.body);
      const ctx = await this.buildContext(req);
      await this.service.exportInventory(filters, ctx, res);
    } catch (error) {
      next(error);
    }
  };

  exportCustomers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = customersReportSchema.parse(req.body);
      const ctx = await this.buildContext(req);
      await this.service.exportCustomers(filters, ctx, res);
    } catch (error) {
      next(error);
    }
  };

  exportFinancial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = financialReportSchema.parse(req.body);
      const ctx = await this.buildContext(req);
      await this.service.exportFinancial(filters, ctx, res);
    } catch (error) {
      next(error);
    }
  };
}

export const reportsController = new ReportsController();
