import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { couponsService, type CouponsService } from './coupons.service';
import {
  createCouponSchema,
  updateCouponSchema,
  couponFilterSchema,
  applyCouponSchema,
  createFlashSaleSchema,
} from './coupons.validation';

export class CouponsController {
  constructor(private readonly service: CouponsService = couponsService) {}

  // ==========================================
  // ADMIN COUPONS
  // ==========================================

  listCoupons = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = couponFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid filter query', parsed.error.format());
      }

      const { items, total } = await this.service.listCoupons(parsed.data);
      const page = parsed.data.page ?? 1;
      const limit = parsed.data.limit ?? 20;
      const totalPages = Math.ceil(total / limit) || 1;

      ApiResponse.paginated(res, 'Coupons retrieved successfully', items, {
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

  getCouponById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const coupon = await this.service.getCouponById(id);
      ApiResponse.success(res, 'Coupon retrieved successfully', coupon);
    } catch (error) {
      next(error);
    }
  };

  createCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const parsed = createCouponSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid coupon creation payload', parsed.error.format());
      }

      const created = await this.service.createCoupon(parsed.data, { id: req.user.userId });
      ApiResponse.created(res, 'Coupon created successfully', created);
    } catch (error) {
      next(error);
    }
  };

  updateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const parsed = updateCouponSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid coupon update payload', parsed.error.format());
      }

      const updated = await this.service.updateCoupon(id, parsed.data, { id: req.user.userId });
      ApiResponse.success(res, 'Coupon updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  deleteCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      await this.service.deleteCoupon(id, { id: req.user.userId });
      ApiResponse.success(res, 'Coupon deleted successfully');
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // CHECKOUT COUPON APIS
  // ==========================================

  applyCouponToCheckout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      const parsed = applyCouponSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid coupon payload', parsed.error.format());
      }

      const result = await this.service.applyCouponToSession(sessionId, parsed.data.code, {
        userId: req.user?.userId,
      });

      ApiResponse.success(res, `Coupon '${result.couponCode}' applied successfully`, result);
    } catch (error) {
      next(error);
    }
  };

  removeCouponFromCheckout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      await this.service.removeCouponFromSession(sessionId);
      ApiResponse.success(res, 'Coupon removed successfully from checkout session');
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // FLASH SALES
  // ==========================================

  listActiveFlashSales = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sales = await this.service.listActiveFlashSales();
      ApiResponse.success(res, 'Active flash sales retrieved successfully', sales);
    } catch (error) {
      next(error);
    }
  };

  createFlashSale = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const parsed = createFlashSaleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid flash sale creation payload', parsed.error.format());
      }

      const sale = await this.service.createFlashSale(parsed.data, { id: req.user.userId });
      ApiResponse.created(res, 'Flash sale created successfully', sale);
    } catch (error) {
      next(error);
    }
  };
}

export const couponsController = new CouponsController();
