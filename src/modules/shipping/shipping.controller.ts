import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { shippingService, type ShippingService } from './shipping.service';
import {
  shippingCalculateQuerySchema,
  createShippingZoneSchema,
  updateShippingZoneSchema,
  createShippingMethodSchema,
  updateShippingMethodSchema,
  createOrderShipmentSchema,
  updateShipmentStatusSchema,
} from './shipping.validation';

export class ShippingController {
  constructor(private readonly service: ShippingService = shippingService) {}

  private async resolveUserPermissions(req: Request): Promise<string[]> {
    if (!req.user) return [];
    const isSuperAdmin =
      req.user.roles.includes('super-admin') ||
      req.user.roles.includes('SUPER_ADMIN') ||
      req.user.roles.includes('admin') ||
      req.user.roles.includes('ADMIN');

    if (isSuperAdmin) {
      return ['*'];
    }

    const permSet = await permissionsCache.getRolePermissions(req.user.roles);
    return Array.from(permSet);
  }

  // ==========================================
  // PUBLIC CALCULATOR
  // ==========================================

  calculateMethods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = shippingCalculateQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid calculation query parameters', parsed.error.format());
      }

      const results = await this.service.calculateShippingMethods(parsed.data);
      ApiResponse.success(res, 'Available shipping methods calculated successfully', results);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // ADMIN ZONES
  // ==========================================

  listZones = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const zones = await this.service.listZones();
      ApiResponse.success(res, 'Shipping zones retrieved successfully', zones);
    } catch (error) {
      next(error);
    }
  };

  getZoneById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const zone = await this.service.getZoneById(id);
      ApiResponse.success(res, 'Shipping zone retrieved successfully', zone);
    } catch (error) {
      next(error);
    }
  };

  createZone = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const parsed = createShippingZoneSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid zone creation payload', parsed.error.format());
      }

      const created = await this.service.createZone(parsed.data, { id: req.user.userId });
      ApiResponse.created(res, 'Shipping zone created successfully', created);
    } catch (error) {
      next(error);
    }
  };

  updateZone = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const parsed = updateShippingZoneSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid zone update payload', parsed.error.format());
      }

      const updated = await this.service.updateZone(id, parsed.data, { id: req.user.userId });
      ApiResponse.success(res, 'Shipping zone updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  deleteZone = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      await this.service.deleteZone(id, { id: req.user.userId });
      ApiResponse.success(res, 'Shipping zone deleted successfully');
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // ADMIN METHODS
  // ==========================================

  listMethods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const zoneId = req.query.zoneId ? String(req.query.zoneId) : undefined;
      const methods = await this.service.listMethods(zoneId);
      ApiResponse.success(res, 'Shipping methods retrieved successfully', methods);
    } catch (error) {
      next(error);
    }
  };

  createMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const parsed = createShippingMethodSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid shipping method creation payload', parsed.error.format());
      }

      const created = await this.service.createMethod(parsed.data, { id: req.user.userId });
      ApiResponse.created(res, 'Shipping method created successfully', created);
    } catch (error) {
      next(error);
    }
  };

  updateMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      const parsed = updateShippingMethodSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid shipping method update payload', parsed.error.format());
      }

      const updated = await this.service.updateMethod(id, parsed.data, { id: req.user.userId });
      ApiResponse.success(res, 'Shipping method updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  deleteMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const id = req.params.id as string;
      await this.service.deleteMethod(id, { id: req.user.userId });
      ApiResponse.success(res, 'Shipping method deleted successfully');
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // ORDER SHIPMENTS
  // ==========================================

  getOrderShipment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const shipment = await this.service.getOrderShipment(orderId);
      ApiResponse.success(res, 'Order shipment retrieved successfully', shipment);
    } catch (error) {
      next(error);
    }
  };

  createOrderShipment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const parsed = createOrderShipmentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid shipment payload', parsed.error.format());
      }

      const permissions = await this.resolveUserPermissions(req);
      const shipment = await this.service.createOrderShipment(
        orderId,
        parsed.data,
        { id: req.user.userId, permissions },
      );
      ApiResponse.created(res, 'Order shipment created and registered successfully', shipment);
    } catch (error) {
      next(error);
    }
  };

  updateShipmentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const shipmentId = req.params.id as string;
      const parsed = updateShipmentStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid shipment status payload', parsed.error.format());
      }

      const permissions = await this.resolveUserPermissions(req);
      const updated = await this.service.updateShipmentStatus(
        shipmentId,
        parsed.data,
        { id: req.user.userId, permissions },
      );
      ApiResponse.success(res, 'Shipment status updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  updateOrderShipmentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized('Authentication required');
      const orderId = req.params.id as string;
      const parsed = updateShipmentStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.badRequest('Invalid shipment status payload', parsed.error.format());
      }

      const shipment = await this.service.getOrderShipment(orderId);
      if (!shipment) throw AppError.notFound(`No shipment found for order '${orderId}'`);

      const permissions = await this.resolveUserPermissions(req);
      const updated = await this.service.updateShipmentStatus(
        shipment.id,
        parsed.data,
        { id: req.user.userId, permissions },
      );
      ApiResponse.success(res, 'Order shipment status updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };
}

export const shippingController = new ShippingController();
