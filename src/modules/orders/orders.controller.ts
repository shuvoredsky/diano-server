import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { ordersService, type OrdersService } from './orders.service';
import type { OrderFilter } from './orders.types';
import {
  createOrderSchema,
  orderFilterSchema,
  updateOrderStatusSchema,
  addOrderNoteSchema,
  trackOrderSchema,
  cancelOrderSchema,
} from './orders.validation';

export class OrdersController {
  constructor(private readonly service: OrdersService = ordersService) {}

  private async resolveUserPermissions(req: Request): Promise<string[]> {
    if (!req.user) return [];
    const isSuperAdmin =
      req.user.roles.includes('super-admin') ||
      req.user.roles.includes('SUPER_ADMIN') ||
      req.user.roles.includes('admin') ||
      req.user.roles.includes('ADMIN');

    if (isSuperAdmin) {
      return [
        'order:read',
        'order:manage',
        'order:update_status',
        'order:confirm',
        'order:ship',
        'order:cancel',
        'order:view_cost',
      ];
    }

    const permSet = await permissionsCache.getRolePermissions(req.user.roles);
    return Array.from(permSet);
  }

  // ============================================================================
  // CUSTOMER ENDPOINTS
  // ============================================================================

  createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idempotencyKey = (
        (req.headers['idempotency-key'] as string) ||
        (req.headers['Idempotency-Key'] as string) ||
        ''
      ).trim();

      if (!idempotencyKey) {
        throw AppError.badRequest('Idempotency-Key header is required');
      }

      const body = createOrderSchema.parse(req.body);

      const result = await this.service.createOrder(
        {
          checkoutSessionId: body.checkoutSessionId,
          idempotencyKey,
          guestSecretToken: body.guestSecretToken,
          customerNotes: body.customerNotes,
        },
        req.user ? { id: req.user.userId, email: req.user.email } : undefined,
      );

      if (result.isIdempotentReplay) {
        ApiResponse.success(res, 'Order retrieved successfully (idempotent)', result.order, 200);
      } else {
        ApiResponse.created(res, 'Order placed successfully', result.order);
      }
    } catch (error) {
      next(error);
    }
  };

  getMyOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const { items, total } = await this.service.getCustomerOrders(req.user.userId, page, limit);

      const totalPages = Math.ceil(total / limit) || 1;
      ApiResponse.paginated(res, 'Customer orders retrieved', items, {
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

  getMyOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const permissions = await this.resolveUserPermissions(req);

      const order = await this.service.getOrderById(orderId, {
        id: req.user.userId,
        permissions,
      });

      ApiResponse.success(res, 'Order retrieved successfully', order);
    } catch (error) {
      next(error);
    }
  };

  cancelMyOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const body = cancelOrderSchema.parse(req.body);

      const cancelled = await this.service.cancelOrderByCustomer(
        orderId,
        req.user.userId,
        body.reason,
      );

      ApiResponse.success(res, 'Order cancelled successfully', cancelled);
    } catch (error) {
      next(error);
    }
  };

  getMyOrderInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const permissions = await this.resolveUserPermissions(req);

      const { buffer, filename } = await this.service.getOrderInvoicePdf(orderId, {
        id: req.user.userId,
        permissions,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  };

  // ============================================================================
  // PUBLIC TRACKING ENDPOINT
  // ============================================================================

  trackOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = trackOrderSchema.parse(req.body);
      const tracking = await this.service.trackOrder(body.orderNumber, body.phone);
      ApiResponse.success(res, 'Order tracking details retrieved', tracking);
    } catch (error) {
      next(error);
    }
  };

  // ============================================================================
  // ADMIN & ORDER MANAGER ENDPOINTS
  // ============================================================================

  listAdminOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const filter = orderFilterSchema.parse({
        ...req.query,
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      });

      const permissions = await this.resolveUserPermissions(req);
      const page = filter.page ?? 1;
      const limit = filter.limit ?? 20;

      const { items, total } = await this.service.listOrdersForAdmin(
        filter as unknown as OrderFilter,
        {
          id: req.user.userId,
          permissions,
        },
      );

      const totalPages = Math.ceil(total / limit) || 1;
      ApiResponse.paginated(res, 'Orders list retrieved successfully', items, {
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

  getAdminOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const permissions = await this.resolveUserPermissions(req);

      const order = await this.service.getOrderById(orderId, {
        id: req.user.userId,
        permissions,
      });

      ApiResponse.success(res, 'Order retrieved successfully', order);
    } catch (error) {
      next(error);
    }
  };

  updateAdminOrderStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const body = updateOrderStatusSchema.parse(req.body);
      const permissions = await this.resolveUserPermissions(req);

      const updated = await this.service.updateOrderStatus(
        orderId,
        {
          status: body.status,
          note: body.note,
        },
        {
          id: req.user.userId,
          permissions,
        },
      );

      ApiResponse.success(res, 'Order status updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  addAdminOrderNote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const body = addOrderNoteSchema.parse(req.body);
      const permissions = await this.resolveUserPermissions(req);

      const note = await this.service.addOrderNote(
        orderId,
        {
          note: body.note,
          isCustomerVisible: body.isCustomerVisible,
        },
        {
          id: req.user.userId,
          permissions,
        },
      );

      ApiResponse.created(res, 'Order note added successfully', note);
    } catch (error) {
      next(error);
    }
  };

  getAdminOrderTimeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const permissions = await this.resolveUserPermissions(req);

      const order = await this.service.getOrderById(orderId, {
        id: req.user.userId,
        permissions,
      });

      ApiResponse.success(res, 'Order timeline retrieved', order.statusHistory || []);
    } catch (error) {
      next(error);
    }
  };

  getAdminOrderInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const permissions = await this.resolveUserPermissions(req);

      const { buffer, filename } = await this.service.getOrderInvoicePdf(orderId, {
        id: req.user.userId,
        permissions,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  };
}

export const ordersController = new OrdersController();
