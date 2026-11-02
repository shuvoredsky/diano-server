import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { ordersService, type OrdersService } from '@/modules/orders/orders.service';
import { ordersRepository, type OrdersRepository } from '@/modules/orders/orders.repository';
import { shippingRepository, type ShippingRepository } from './shipping.repository';
import { shippingCalculator, type ShippingCalculator } from './shipping.calculator';
import { manualCourierAdapter } from './courier.adapter';
import type {
  ShippingZoneEntity,
  ShippingMethodEntity,
  ShipmentEntity,
  CreateShippingZoneInput,
  UpdateShippingZoneInput,
  CreateShippingMethodInput,
  UpdateShippingMethodInput,
  CreateOrderShipmentInput,
  UpdateShipmentStatusInput,
  ShippingCalculateParams,
  ShippingCalculationMethodResult,
  CourierAdapter,
} from './shipping.types';

export class ShippingService {
  constructor(
    private readonly repo: ShippingRepository = shippingRepository,
    private readonly calc: ShippingCalculator = shippingCalculator,
    private readonly audit: IAuditService = auditService,
    private readonly ordersRepo: OrdersRepository = ordersRepository,
    private readonly ordersSvc: OrdersService = ordersService,
    private readonly defaultCourier: CourierAdapter = manualCourierAdapter,
  ) {}

  // ==========================================
  // ZONES & METHODS
  // ==========================================

  async listZones(): Promise<ShippingZoneEntity[]> {
    return this.repo.listZones();
  }

  async getZoneById(id: string): Promise<ShippingZoneEntity> {
    const zone = await this.repo.findZoneById(id);
    if (!zone) throw AppError.notFound(`Shipping zone '${id}' not found`);
    return zone;
  }

  async createZone(
    input: CreateShippingZoneInput,
    actor?: { id: string },
  ): Promise<ShippingZoneEntity> {
    const zone = await this.repo.createZone(input);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'SHIPPING_ZONE_CREATED',
      targetType: 'SHIPPING_ZONE',
      targetId: zone.id,
      metadata: { name: zone.name, districts: zone.districts },
    });

    return zone;
  }

  async updateZone(
    id: string,
    input: UpdateShippingZoneInput,
    actor?: { id: string },
  ): Promise<ShippingZoneEntity> {
    await this.getZoneById(id);
    const updated = await this.repo.updateZone(id, input);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'SHIPPING_ZONE_UPDATED',
      targetType: 'SHIPPING_ZONE',
      targetId: id,
      metadata: input as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async deleteZone(id: string, actor?: { id: string }): Promise<void> {
    await this.getZoneById(id);
    await this.repo.deleteZone(id);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'SHIPPING_ZONE_DELETED',
      targetType: 'SHIPPING_ZONE',
      targetId: id,
    });
  }

  async listMethods(zoneId?: string): Promise<ShippingMethodEntity[]> {
    return this.repo.listMethods(zoneId);
  }

  async createMethod(
    input: CreateShippingMethodInput,
    actor?: { id: string },
  ): Promise<ShippingMethodEntity> {
    const existing = await this.repo.findMethodByCode(input.code);
    if (existing) {
      throw AppError.conflict(`Shipping method with code '${input.code}' already exists`);
    }

    const method = await this.repo.createMethod(input);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'SHIPPING_METHOD_CREATED',
      targetType: 'SHIPPING_METHOD',
      targetId: method.id,
      metadata: { code: method.code, baseCharge: method.baseCharge },
    });

    return method;
  }

  async updateMethod(
    id: string,
    input: UpdateShippingMethodInput,
    actor?: { id: string },
  ): Promise<ShippingMethodEntity> {
    const method = await this.repo.findMethodById(id);
    if (!method) throw AppError.notFound(`Shipping method '${id}' not found`);

    if (input.code && input.code !== method.code) {
      const existing = await this.repo.findMethodByCode(input.code);
      if (existing) {
        throw AppError.conflict(`Shipping method code '${input.code}' is already in use`);
      }
    }

    const updated = await this.repo.updateMethod(id, input);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'SHIPPING_METHOD_UPDATED',
      targetType: 'SHIPPING_METHOD',
      targetId: id,
      metadata: input as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async deleteMethod(id: string, actor?: { id: string }): Promise<void> {
    const method = await this.repo.findMethodById(id);
    if (!method) throw AppError.notFound(`Shipping method '${id}' not found`);

    await this.repo.deleteMethod(id);

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'SHIPPING_METHOD_DELETED',
      targetType: 'SHIPPING_METHOD',
      targetId: id,
    });
  }

  // ==========================================
  // CALCULATOR QUERY
  // ==========================================

  async calculateShippingMethods(
    params: ShippingCalculateParams,
  ): Promise<ShippingCalculationMethodResult[]> {
    return this.calc.calculateMethods(params);
  }

  // ==========================================
  // ORDER SHIPMENTS
  // ==========================================

  async getOrderShipment(orderId: string): Promise<ShipmentEntity | null> {
    return this.repo.findShipmentByOrderId(orderId);
  }

  async createOrderShipment(
    orderId: string,
    input: CreateOrderShipmentInput,
    actor?: { id: string; permissions?: string[] },
  ): Promise<ShipmentEntity> {
    // 1. Verify order exists
    const order = await this.ordersRepo.findById(orderId);
    if (!order) throw AppError.notFound(`Order '${orderId}' not found`);

    // 2. Validate order status eligibility
    const validStatuses = ['CONFIRMED', 'PROCESSING', 'PACKED'];
    if (!validStatuses.includes(order.status)) {
      throw AppError.badRequest(
        `Cannot create shipment for order in '${order.status}' status. Order must be CONFIRMED, PROCESSING, or PACKED.`,
      );
    }

    // 3. Ensure no existing shipment
    const existing = await this.repo.findShipmentByOrderId(orderId);
    if (existing) {
      throw AppError.conflict(`Shipment already exists for order '${orderId}'`);
    }

    // 4. Resolve tracking number
    let trackingNumber = input.trackingNumber?.trim();
    let labelUrl = input.labelUrl;

    if (!trackingNumber) {
      const courierResult = await this.defaultCourier.createShipment({
        orderId: order.id,
        recipientName: (order.shippingAddressSnapshot as { fullName?: string })?.fullName || 'Valued Customer',
        recipientPhone: (order.shippingAddressSnapshot as { phone?: string })?.phone || '',
        recipientAddress: (order.shippingAddressSnapshot as { address?: string })?.address || '',
        district: (order.shippingAddressSnapshot as { district?: string })?.district || 'Dhaka',
        codAmount: order.paymentMethod === 'COD' && order.paymentStatus !== 'PAID' ? Number(order.grandTotal) : 0,
        notes: input.notes,
      });

      trackingNumber = courierResult.trackingNumber;
      labelUrl = labelUrl || courierResult.labelUrl;
    }

    // 5. Create shipment record
    const initialStatus = input.status || 'PENDING';
    const isDispatched = initialStatus === 'PICKED_UP' || initialStatus === 'IN_TRANSIT';

    const shipment = await this.repo.createShipment({
      orderId,
      shippingMethodId: input.shippingMethodId,
      courierName: input.courierName,
      trackingNumber,
      status: initialStatus,
      labelUrl,
      dispatchedAt: isDispatched ? new Date() : undefined,
    });

    // 6. Record initial event
    await this.repo.addShipmentEvent({
      shipmentId: shipment.id,
      status: initialStatus,
      description: `Shipment booked with ${input.courierName} (Tracking: ${trackingNumber})`,
      occurredAt: new Date(),
    });

    // 7. If initial status is dispatched, trigger order transition to SHIPPED through state machine
    if (isDispatched && order.status !== 'SHIPPED') {
      const actorCtx = {
        id: actor?.id || 'SYSTEM',
        permissions: actor?.permissions || ['order:update_status', 'order:ship', 'order:manage'],
      };

      if (order.status === 'CONFIRMED') {
        await this.ordersSvc.updateOrderStatus(orderId, { status: 'PROCESSING' }, actorCtx);
        await this.ordersSvc.updateOrderStatus(orderId, { status: 'PACKED' }, actorCtx);
      } else if (order.status === 'PROCESSING') {
        await this.ordersSvc.updateOrderStatus(orderId, { status: 'PACKED' }, actorCtx);
      }

      await this.ordersSvc.updateOrderStatus(
        orderId,
        { status: 'SHIPPED', note: `Shipment dispatched via ${input.courierName} (${trackingNumber})` },
        actorCtx,
      );
    }

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'ORDER_SHIPMENT_CREATED',
      targetType: 'SHIPMENT',
      targetId: shipment.id,
      metadata: { orderId, trackingNumber, courierName: input.courierName, status: initialStatus },
    });

    return shipment;
  }

  async updateShipmentStatus(
    shipmentId: string,
    input: UpdateShipmentStatusInput,
    actor?: { id: string; permissions?: string[] },
  ): Promise<ShipmentEntity> {
    const shipment = await this.repo.findShipmentById(shipmentId);
    if (!shipment) throw AppError.notFound(`Shipment '${shipmentId}' not found`);

    const updateData: {
      status: typeof input.status;
      dispatchedAt?: Date;
      deliveredAt?: Date;
    } = { status: input.status };

    if (input.status === 'PICKED_UP' || input.status === 'IN_TRANSIT') {
      if (!shipment.dispatchedAt) updateData.dispatchedAt = new Date();
    }

    if (input.status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    }

    const updated = await this.repo.updateShipment(shipmentId, updateData);

    // Record shipment event
    await this.repo.addShipmentEvent({
      shipmentId,
      status: input.status,
      location: input.location,
      description: input.note || `Shipment status updated to ${input.status}`,
      occurredAt: new Date(),
    });

    // If failed attempt, record delivery attempt
    if (input.status === 'FAILED_ATTEMPT') {
      const attemptCount = (shipment.attempts?.length || 0) + 1;
      await this.repo.addDeliveryAttempt({
        shipmentId,
        attemptNumber: attemptCount,
        status: 'FAILED',
        reason: input.note || 'Delivery attempt unsuccessful',
        attemptedAt: new Date(),
      });
    }

    // STATE MACHINE HOOK: When shipment becomes DELIVERED, advance order to DELIVERED
    if (input.status === 'DELIVERED') {
      const order = await this.ordersRepo.findById(shipment.orderId);
      if (order && order.status !== 'DELIVERED') {
        await this.ordersSvc.updateOrderStatus(
          shipment.orderId,
          {
            status: 'DELIVERED',
            note: input.note || `Package delivered by courier (${shipment.courierName})`,
          },
          { id: actor?.id || 'SYSTEM', permissions: actor?.permissions || ['order:update_status', 'order:manage'] },
        );
      }
    }

    // STATE MACHINE HOOK: When shipment is picked up or in transit, advance order to SHIPPED if not already
    if ((input.status === 'PICKED_UP' || input.status === 'IN_TRANSIT') && shipment.status === 'PENDING') {
      const order = await this.ordersRepo.findById(shipment.orderId);
      if (order && order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
        await this.ordersSvc.updateOrderStatus(
          shipment.orderId,
          {
            status: 'SHIPPED',
            note: `In transit with courier ${shipment.courierName}`,
          },
          { id: actor?.id || 'SYSTEM', permissions: actor?.permissions || ['order:ship', 'order:manage'] },
        );
      }
    }

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'SHIPMENT_STATUS_UPDATED',
      targetType: 'SHIPMENT',
      targetId: shipmentId,
      metadata: { previousStatus: shipment.status, newStatus: input.status, orderId: shipment.orderId },
    });

    return updated;
  }
}

export const shippingService = new ShippingService();
