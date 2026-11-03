import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { analyticsService, type AnalyticsService } from './analytics.service';
import {
  analyticsQuerySchema,
  chartTypeEnum,
} from './analytics.validation';
import { AppError } from '@/utils/app-error';

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService = analyticsService) {}

  private async canViewFinance(req: Request): Promise<boolean> {
    if (!req.user) return false;
    const isSuperAdmin = req.user.roles.some(
      r => r.toLowerCase() === 'super-admin' || r.toLowerCase() === 'super_admin',
    );
    if (isSuperAdmin) return true;

    return permissionsCache.hasPermission(req.user.roles, 'analytics:view_finance');
  }

  getOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const data = await this.service.getOverview(query);
      const hasFinance = await this.canViewFinance(req);

      if (!hasFinance) {
        data.cards.grossProfit = null;
        data.cards.netProfit = null;
      }

      ApiResponse.success(res, 'Analytics overview retrieved successfully', data);
    } catch (error) {
      next(error);
    }
  };

  getRevenue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const data = await this.service.getRevenue(query);
      const hasFinance = await this.canViewFinance(req);

      if (!hasFinance) {
        delete data.cogs;
        delete data.cogsCoveragePercent;
        delete data.isCogsComplete;
        delete data.grossProfit;
        delete data.grossProfitMarginPercent;
        delete data.expenses;
        delete data.paymentFees;
        delete data.netProfit;
        delete data.netProfitMarginPercent;
      }

      ApiResponse.success(res, 'Revenue analytics retrieved successfully', data);
    } catch (error) {
      next(error);
    }
  };

  getOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const data = await this.service.getOrders(query);
      ApiResponse.success(res, 'Orders analytics retrieved successfully', data);
    } catch (error) {
      next(error);
    }
  };

  getProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const data = await this.service.getProducts(query);
      ApiResponse.success(res, 'Products analytics retrieved successfully', data);
    } catch (error) {
      next(error);
    }
  };

  getInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getInventory();
      const hasFinance = await this.canViewFinance(req);

      if (!hasFinance) {
        delete data.totalInventoryValuation;
      }

      ApiResponse.success(res, 'Inventory analytics retrieved successfully', data);
    } catch (error) {
      next(error);
    }
  };

  getCustomers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const data = await this.service.getCustomers(query);
      ApiResponse.success(res, 'Customers analytics retrieved successfully', data);
    } catch (error) {
      next(error);
    }
  };

  getPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const data = await this.service.getPayments(query);
      const hasFinance = await this.canViewFinance(req);

      if (!hasFinance) {
        delete data.totalGatewayFees;
      }

      ApiResponse.success(res, 'Payments analytics retrieved successfully', data);
    } catch (error) {
      next(error);
    }
  };

  getFunnel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const data = await this.service.getFunnel(query);
      ApiResponse.success(res, 'Conversion funnel analytics retrieved successfully', data);
    } catch (error) {
      next(error);
    }
  };

  getChart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const type = chartTypeEnum.parse(req.params.type);
      const query = analyticsQuerySchema.parse(req.query);

      if (type === 'profit-trend') {
        const hasFinance = await this.canViewFinance(req);
        if (!hasFinance) {
          throw AppError.forbidden('Profit chart requires analytics:view_finance permission');
        }
      }

      const data = await this.service.getChart(type, query);
      ApiResponse.success(res, `Chart data for ${type} retrieved successfully`, data);
    } catch (error) {
      next(error);
    }
  };
}

export const analyticsController = new AnalyticsController();
