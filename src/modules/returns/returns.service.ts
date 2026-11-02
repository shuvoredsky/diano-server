import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { inventoryService, type InventoryService } from '@/modules/inventory/inventory.service';
import { calculateProportionalReturnRefund } from '@/modules/refunds/refunds.calculator';
import { refundsRepository, type RefundsRepository } from '@/modules/refunds/refunds.repository';
import { returnsRepository, type ReturnsRepository } from './returns.repository';
import type {
  ReturnRequestEntity,
  ReturnReasonEntity,
  CreateReturnRequestInput,
  ReviewReturnInput,
  ReceiveReturnInput,
  ReturnFilter,
} from './returns.types';

export class ReturnsService {
  constructor(
    private readonly repo: ReturnsRepository = returnsRepository,
    private readonly inventorySvc: InventoryService = inventoryService,
    private readonly refundsRepo: RefundsRepository = refundsRepository,
    private readonly audit: IAuditService = auditService,
  ) {}

  // ==========================================
  // CUSTOMER RETURN FLOW
  // ==========================================

  async requestReturn(
    orderId: string,
    input: CreateReturnRequestInput,
    customerId: string,
  ): Promise<ReturnRequestEntity> {
    // 1. Order verification & ownership IDOR protection
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw AppError.notFound(`Order '${orderId}' not found`);

    if (order.customerId !== customerId) {
      throw AppError.forbidden('You can only request returns for your own orders');
    }

    // 2. State machine check: Order must be DELIVERED
    if (order.status !== 'DELIVERED') {
      throw AppError.badRequest(
        `Returns can only be requested for orders in DELIVERED status. Current status: '${order.status}'`,
      );
    }

    // 3. Return window check: default 7 days from deliveredAt (or updatedAt)
    const deliveredAt = order.deliveredAt || order.updatedAt;
    const windowDays = Number(process.env.RETURN_WINDOW_DAYS) || 7;
    const returnDeadline = new Date(deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000);

    if (new Date() > returnDeadline) {
      throw AppError.badRequest(
        `The return policy window of ${windowDays} days for this order has expired`,
      );
    }

    if (!input.items || input.items.length === 0) {
      throw AppError.badRequest('At least one item must be selected for return');
    }

    // 4. Validate items and remaining returnable quantity
    const orderItemMap = new Map(order.items.map(i => [i.id, i]));
    const validatedItems: Array<{ orderItemId: string; quantity: number }> = [];

    for (const item of input.items) {
      const orderItem = orderItemMap.get(item.orderItemId);
      if (!orderItem) {
        throw AppError.badRequest(`Order item '${item.orderItemId}' does not belong to this order`);
      }

      if (item.quantity <= 0) {
        throw AppError.badRequest(`Return quantity for '${orderItem.productName}' must be greater than zero`);
      }

      const alreadyReturned = await this.repo.getAlreadyReturnedQuantity(item.orderItemId);
      const remainingReturnable = orderItem.quantity - alreadyReturned;

      if (item.quantity > remainingReturnable) {
        throw AppError.badRequest(
          `Requested return quantity (${item.quantity}) for '${orderItem.productName}' exceeds remaining returnable quantity (${remainingReturnable})`,
        );
      }

      validatedItems.push({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      });
    }

    // 5. Create return request
    const returnRequest = await this.repo.createReturnRequest({
      orderId,
      customerId,
      reasonId: input.reasonId,
      customerNote: input.customerNote,
      items: validatedItems,
    });

    await this.audit.record({
      actorId: customerId,
      actorType: 'USER',
      action: 'RETURN_REQUESTED',
      targetType: 'RETURN_REQUEST',
      targetId: returnRequest.id,
      metadata: { orderId, returnNumber: returnRequest.returnNumber, itemCount: validatedItems.length },
    });

    return returnRequest;
  }

  async getCustomerReturns(customerId: string): Promise<ReturnRequestEntity[]> {
    const { items } = await this.repo.listReturns({ customerId, limit: 100 });
    return items;
  }

  // ==========================================
  // ADMIN REVIEW & INSPECTION FLOW
  // ==========================================

  async listReturns(filter: ReturnFilter): Promise<{ items: ReturnRequestEntity[]; total: number }> {
    return this.repo.listReturns(filter);
  }

  async getReturnById(id: string): Promise<ReturnRequestEntity> {
    const returnReq = await this.repo.findById(id);
    if (!returnReq) throw AppError.notFound(`Return request '${id}' not found`);
    return returnReq;
  }

  async reviewReturn(
    id: string,
    input: ReviewReturnInput,
    actor?: { id: string },
  ): Promise<ReturnRequestEntity> {
    const returnReq = await this.getReturnById(id);

    if (returnReq.status !== 'REQUESTED') {
      throw AppError.badRequest(`Cannot review return request currently in '${returnReq.status}' status`);
    }

    const newStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const updated = await this.repo.updateReturnRequest(id, {
      status: newStatus,
      staffNote: input.staffNote ?? returnReq.staffNote,
    });

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: `RETURN_${newStatus}`,
      targetType: 'RETURN_REQUEST',
      targetId: id,
      metadata: { previousStatus: returnReq.status, newStatus, staffNote: input.staffNote },
    });

    return updated;
  }

  /**
   * Receives returned physical items, records inspection condition, restocks good items to inventory
   * with RETURN_RESTOCK ledger movement, and calculates proportional refund amount.
   */
  async receiveAndInspectReturn(
    id: string,
    input: ReceiveReturnInput,
    actor?: { id: string },
  ): Promise<ReturnRequestEntity> {
    const returnReq = await this.getReturnById(id);

    const eligibleStatuses = ['APPROVED', 'ITEM_RECEIVED', 'RECEIVED'];
    if (!eligibleStatuses.includes(returnReq.status)) {
      throw AppError.badRequest(
        `Cannot inspect return request in '${returnReq.status}' status. It must be APPROVED first.`,
      );
    }

    // Resolve warehouse for restock
    const defaultWarehouse = await prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
    });
    const defaultWarehouseId = defaultWarehouse?.id || 'WH-DHK-01';

    const order = await prisma.order.findUnique({
      where: { id: returnReq.orderId },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!order) throw AppError.notFound(`Associated order '${returnReq.orderId}' not found`);

    const returnItemMap = new Map((returnReq.items || []).map(i => [i.id, i]));
    const itemsApprovedForRefund: Array<{
      orderItemId: string;
      unitPrice: string;
      quantity: number;
      lineTotal: string;
    }> = [];

    // 1. Process each inspected item
    for (const itemInput of input.items) {
      const returnItem = returnItemMap.get(itemInput.itemId);
      if (!returnItem) {
        throw AppError.badRequest(`Return item '${itemInput.itemId}' not found in this request`);
      }

      await this.repo.updateReturnItem(itemInput.itemId, {
        condition: itemInput.condition,
        action: itemInput.action,
      });

      // RESTOCK LEDGER HOOK: If condition is GOOD and action is REFUND, restock to inventory
      if (itemInput.condition === 'GOOD' && itemInput.action === 'REFUND') {
        const orderItem = order.items.find(oi => oi.id === returnItem.orderItemId);
        if (orderItem && orderItem.variantId) {
          const warehouseId = itemInput.warehouseId || defaultWarehouseId;

          await this.inventorySvc.restock({
            variantId: orderItem.variantId,
            warehouseId,
            quantity: returnItem.quantity,
            reason: `Return restock from ${returnReq.returnNumber} (${orderItem.productName})`,
            referenceType: 'RETURN',
            referenceId: returnReq.id,
            actorId: actor?.id,
          });
        }
      }

      if (itemInput.action === 'REFUND') {
        const orderItem = order.items.find(oi => oi.id === returnItem.orderItemId);
        if (orderItem) {
          const unitPrice = orderItem.unitPrice.toString();
          const lineTotal = (Number(unitPrice) * returnItem.quantity).toFixed(2);
          itemsApprovedForRefund.push({
            orderItemId: orderItem.id,
            unitPrice,
            quantity: returnItem.quantity,
            lineTotal,
          });
        }
      }
    }

    // 2. Proportional coupon discount refund calculation
    let totalPaid = 0;
    for (const p of order.payments) {
      if (p.status === 'PAID' || p.status === 'COMPLETED') {
        totalPaid += Number(p.amount);
      }
    }
    if (totalPaid === 0 && order.paymentMethod === 'COD' && order.status === 'DELIVERED') {
      totalPaid = Number(order.grandTotal);
    }

    const totalRefunded = await this.refundsRepo.getOrderTotalRefunded(order.id);

    const refundCalc = calculateProportionalReturnRefund({
      orderSubtotal: order.subtotal.toString(),
      orderDiscountTotal: order.discountTotal.toString(),
      orderShippingTotal: order.shippingTotal.toString(),
      orderTotalPaid: totalPaid.toFixed(2),
      orderTotalRefunded: totalRefunded,
      returnedItems: itemsApprovedForRefund,
      includeShipping: input.includeShippingRefund,
    });

    // 3. Update return request status to INSPECTED with calculated refundAmount
    const updated = await this.repo.updateReturnRequest(id, {
      status: 'INSPECTED',
      refundAmount: refundCalc.totalRefundAmount,
      staffNote: input.staffNote ?? returnReq.staffNote,
      inspectedAt: new Date(),
    });

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'RETURN_INSPECTED',
      targetType: 'RETURN_REQUEST',
      targetId: id,
      metadata: {
        returnNumber: returnReq.returnNumber,
        inspectedCount: input.items.length,
        calculatedRefund: refundCalc.totalRefundAmount,
      },
    });

    return updated;
  }

  async listReturnReasons(): Promise<ReturnReasonEntity[]> {
    return this.repo.listActiveReasons();
  }
}

export const returnsService = new ReturnsService();
