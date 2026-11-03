import crypto from 'crypto';
import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { ordersRepository, type OrdersRepository } from './orders.repository';
import { invoiceService, type InvoiceService } from './invoice.service';
import {
  assertValidTransition,
  getRequiredPermissionForTransition,
  canCustomerCancel,
} from './orders.state-machine';
import type {
  OrderEntity,
  CreateOrderInput,
  OrderFilter,
  UpdateOrderStatusInput,
  AddOrderNoteInput,
  OrderTrackResult,
  IFraudAssessor,
  OrderNoteItem,
} from './orders.types';

export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository = ordersRepository,
    private readonly audit: IAuditService = auditService,
    private readonly invoiceSvc: InvoiceService = invoiceService,
    private fraudAssessor?: IFraudAssessor,
  ) {}

  public setFraudAssessor(assessor: IFraudAssessor): void {
    this.fraudAssessor = assessor;
  }

  /**
   * Generates a deterministic hash of the checkout session payload for idempotency verification
   */
  generatePayloadHash(sessionId: string, notes?: string): string {
    return crypto
      .createHash('sha256')
      .update(`${sessionId}:${notes || ''}`)
      .digest('hex');
  }

  /**
   * Sanitizes order data based on user permissions (masks confidential costPrice/profit)
   */
  sanitizeOrder(order: OrderEntity, hasViewCostPermission: boolean): OrderEntity {
    if (hasViewCostPermission) return order;

    return {
      ...order,
      items: order.items.map(item => ({
        ...item,
        costPrice: null,
      })),
    };
  }

  /**
   * Places an order atomically from an active checkout session
   */
  async createOrder(
    input: CreateOrderInput,
    currentUser?: { id: string; email: string },
  ): Promise<{ order: OrderEntity; isIdempotentReplay: boolean }> {
    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
      throw AppError.badRequest('Valid Idempotency-Key header is required');
    }

    const payloadHash = this.generatePayloadHash(input.checkoutSessionId, input.customerNotes);

    const result = await this.repo.createOrderInTransaction({
      ...input,
      payloadHash,
    });

    // Run FraudAssessor hook
    if (!result.isIdempotentReplay) {
      if (this.fraudAssessor) {
        await this.fraudAssessor.assessOrder(result.order);
      }

      await this.audit.record({
        actorId: currentUser?.id || result.order.customerId || undefined,
        actorType: currentUser ? 'USER' : 'GUEST',
        action: 'ORDER_CREATED',
        targetType: 'ORDER',
        targetId: result.order.id,
        metadata: {
          orderNumber: result.order.orderNumber,
          grandTotal: result.order.grandTotal,
          paymentMethod: result.order.paymentMethod,
        },
      });
    }

    return result;
  }

  /**
   * Retrieves single order by ID with ownership IDOR enforcement
   */
  async getOrderById(
    orderId: string,
    currentUser: { id: string; permissions: string[] },
  ): Promise<OrderEntity> {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw AppError.notFound('Order not found');
    }

    const isStaff = currentUser.permissions.some(p =>
      ['order:read', 'order:manage', 'order:update_status'].includes(p),
    );

    // IDOR protection: non-staff can strictly access only their own orders
    if (!isStaff && order.customerId !== currentUser.id) {
      throw AppError.forbidden('Access denied to this order');
    }

    const hasViewCost = currentUser.permissions.includes('order:view_cost');
    return this.sanitizeOrder(order, hasViewCost);
  }

  /**
   * Retrieves paginated orders for the authenticated customer
   */
  async getCustomerOrders(
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: OrderEntity[]; total: number }> {
    const res = await this.repo.listCustomerOrders(customerId, page, limit);
    return {
      items: res.items.map(o => this.sanitizeOrder(o, false)),
      total: res.total,
    };
  }

  /**
   * Retrieves paginated orders for administration
   */
  async listOrdersForAdmin(
    filter: OrderFilter,
    currentUser: { id: string; permissions: string[] },
  ): Promise<{ items: OrderEntity[]; total: number }> {
    const res = await this.repo.listOrders(filter);
    const hasViewCost = currentUser.permissions.includes('order:view_cost');
    return {
      items: res.items.map(o => this.sanitizeOrder(o, hasViewCost)),
      total: res.total,
    };
  }

  /**
   * Updates order lifecycle state machine with atomic side-effects
   */
  async updateOrderStatus(
    orderId: string,
    input: UpdateOrderStatusInput,
    actorContext: { id: string; permissions: string[] },
  ): Promise<OrderEntity> {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw AppError.notFound('Order not found');
    }

    // Idempotent same-state check
    if (order.status === input.status) {
      const hasViewCost =
        actorContext.permissions.includes('*') || actorContext.permissions.includes('order:view_cost');
      return this.sanitizeOrder(order, hasViewCost);
    }

    // State machine validity check (throws 409 Conflict if invalid)
    assertValidTransition(order.status, input.status);

    // Enforce granular permission per transition
    const requiredPerm = getRequiredPermissionForTransition(input.status);
    const hasPermission =
      actorContext.permissions.includes('*') ||
      actorContext.permissions.includes(requiredPerm) ||
      actorContext.permissions.includes('order:manage');

    if (!hasPermission) {
      throw AppError.forbidden(`Permission '${requiredPerm}' is required to transition order to '${input.status}'`);
    }

    // Block transition to CONFIRMED or SHIPPED if held under high fraud risk
    if (input.status === 'CONFIRMED' || input.status === 'SHIPPED') {
      const fraudAssessment = await prisma.fraudAssessment.findUnique({
        where: { orderId },
      });
      if (
        fraudAssessment &&
        fraudAssessment.riskLevel === 'HIGH' &&
        fraudAssessment.reviewStatus !== 'APPROVED' &&
        fraudAssessment.reviewStatus !== 'AUTO_APPROVED'
      ) {
        throw AppError.forbidden(
          'Order is held under manual fraud review and cannot be confirmed or shipped until approved by staff.',
        );
      }
    }

    // Execute state transition and inventory side-effects in a single transaction
    const updated = await prisma.$transaction(async tx => {
      // Find central warehouse for stock operations
      const defaultWarehouse = await tx.warehouse.findFirst({
        where: { isDefault: true, isActive: true },
      });
      const warehouseId = defaultWarehouse?.id || 'WH-DHK-01';

      // 1. Side Effect: Stock commitment on dispatch / fulfillment
      // Rule: COD orders reserve on placement and commit when marked SHIPPED
      if (input.status === 'SHIPPED') {
        for (const item of order.items) {
          if (item.variantId) {
            await inventoryService.commitReservation(
              {
                variantId: item.variantId,
                warehouseId,
                quantity: item.quantity,
                referenceType: 'ORDER',
                referenceId: order.orderNumber,
                actorId: actorContext.id,
                reason: `Order shipped (${order.orderNumber})`,
              },
              tx,
            );
          }
        }
      }

      // 2. Side Effect: Stock release on cancellation
      if (input.status === 'CANCELLED') {
        const canRelease = ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'].includes(order.status);
        if (canRelease) {
          for (const item of order.items) {
            if (item.variantId) {
              await inventoryService.releaseReservation(
                {
                  variantId: item.variantId,
                  warehouseId,
                  quantity: item.quantity,
                  referenceType: 'ORDER',
                  referenceId: order.orderNumber,
                  actorId: actorContext.id,
                  reason: input.note || `Order cancelled from status ${order.status}`,
                },
                tx,
              );
            }
          }
        }
      }

      // 3. Update timestamps and status in Order table
      const updateData: Prisma.OrderUpdateInput = {
        status: input.status,
      };

      if (input.status === 'CONFIRMED') updateData.confirmedAt = new Date();
      if (input.status === 'SHIPPED') updateData.shippedAt = new Date();
      if (input.status === 'DELIVERED') updateData.deliveredAt = new Date();
      if (input.status === 'CANCELLED') {
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = input.note || null;
      }

      await tx.order.update({
        where: { id: order.id },
        data: updateData,
      });

      // 4. Create OrderStatusHistory record
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: input.status,
          changedById: actorContext.id,
          note: input.note || null,
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
          orderNotes: { orderBy: { createdAt: 'desc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          invoiceSnapshot: true,
        },
      });
    }, { timeout: 25000, maxWait: 10000 });

    await this.audit.record({
      actorId: actorContext.id,
      actorType: 'USER',
      action: 'ORDER_STATUS_CHANGED',
      targetType: 'ORDER',
      targetId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        fromStatus: order.status,
        toStatus: input.status,
        note: input.note,
      },
    });

    const hasViewCost =
      actorContext.permissions.includes('*') || actorContext.permissions.includes('order:view_cost');
    return this.sanitizeOrder(this.repo.formatOrder(updated), hasViewCost);
  }

  /**
   * Allows customer to cancel their own PENDING Cash on Delivery (COD) order
   */
  async cancelOrderByCustomer(
    orderId: string,
    customerId: string,
    reason?: string,
  ): Promise<OrderEntity> {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw AppError.notFound('Order not found');
    }

    if (order.customerId !== customerId) {
      throw AppError.forbidden('Access denied to this order');
    }

    if (!canCustomerCancel(order)) {
      throw AppError.badRequest(
        'Customers can only cancel active Cash on Delivery orders in PENDING status',
      );
    }

    return this.updateOrderStatus(
      order.id,
      {
        status: 'CANCELLED',
        note: reason || 'Cancelled by customer',
      },
      {
        id: customerId,
        permissions: ['order:cancel'],
      },
    );
  }

  /**
   * Adds operational or customer-facing note to an order
   */
  async addOrderNote(
    orderId: string,
    input: AddOrderNoteInput,
    actorContext: { id: string; permissions: string[] },
  ): Promise<OrderNoteItem> {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw AppError.notFound('Order not found');
    }

    const note = await this.repo.addOrderNote(
      order.id,
      input.note,
      actorContext.id,
      input.isCustomerVisible ?? false,
    );

    await this.audit.record({
      actorId: actorContext.id,
      actorType: 'USER',
      action: 'ORDER_NOTE_ADDED',
      targetType: 'ORDER',
      targetId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        isCustomerVisible: input.isCustomerVisible,
      },
    });

    return note;
  }

  /**
   * Public tracking endpoint returning minimal safe status information
   */
  async trackOrder(orderNumber: string, phone: string): Promise<OrderTrackResult> {
    const cleanPhone = phone.trim().replace(/^\+?88/, '');
    const order = await this.repo.findByOrderNumber(orderNumber.trim().toUpperCase());

    // Generic error to prevent phone/order enumeration
    if (!order) {
      throw AppError.notFound('No order found matching the provided order number and phone');
    }

    const customerPhone = order.customerSnapshot.phone.trim().replace(/^\+?88/, '');
    if (customerPhone !== cleanPhone) {
      throw AppError.notFound('No order found matching the provided order number and phone');
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      placedAt: order.placedAt.toISOString(),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: order.grandTotal,
      shippingDistrict: order.shippingAddressSnapshot.district,
    };
  }

  /**
   * Generates and streams PDF invoice for authorized customer or staff
   */
  async getOrderInvoicePdf(
    orderId: string,
    currentUser: { id: string; permissions: string[] },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw AppError.notFound('Order not found');
    }

    const isStaff = currentUser.permissions.some(p =>
      ['order:read', 'order:manage'].includes(p),
    );

    // IDOR protection: customers can only download invoices for their own orders
    if (!isStaff && order.customerId !== currentUser.id) {
      throw AppError.forbidden('Access denied to this invoice');
    }

    return this.invoiceSvc.generateInvoicePdf(order);
  }
}

export const ordersService = new OrdersService();
