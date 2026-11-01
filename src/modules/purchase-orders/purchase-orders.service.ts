import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { prisma } from '@/config/database';
import { suppliersRepository } from '@/modules/suppliers/suppliers.repository';
import { purchaseOrdersRepository } from './purchase-orders.repository';
import { calculateWeightedAverageCost } from './purchase-orders.costing';
import type {
  IPurchaseOrdersRepository,
  PurchaseOrderEntity,
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
  PurchaseOrderFilterQuery,
} from './purchase-orders.types';
import { PurchaseOrderStatus } from '@prisma/client';
import crypto from 'crypto';

export class PurchaseOrdersService {
  constructor(
    private readonly repo: IPurchaseOrdersRepository = purchaseOrdersRepository,
    private readonly invService = inventoryService,
    private readonly auditSvc: IAuditService = auditService,
    private readonly suppliersRepo = suppliersRepository,
  ) {}

  /**
   * Collision-safe PO number generator: PO-YYYYMMDD-XXXX
   */
  async generatePoNumber(): Promise<string> {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `PO-${yyyy}${mm}${dd}`;

    for (let attempts = 0; attempts < 5; attempts++) {
      const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
      const poNumber = `${datePrefix}-${suffix}`;
      const existing = await this.repo.findPurchaseOrderByPoNumber(poNumber);
      if (!existing) {
        return poNumber;
      }
    }

    // High entropy fallback
    return `${datePrefix}-${Date.now().toString().slice(-4)}`;
  }

  async listPurchaseOrders(
    filter: PurchaseOrderFilterQuery,
  ): Promise<{ items: PurchaseOrderEntity[]; total: number }> {
    return this.repo.listPurchaseOrders(filter);
  }

  async getPurchaseOrderById(id: string): Promise<PurchaseOrderEntity> {
    const po = await this.repo.findPurchaseOrderById(id);
    if (!po) {
      throw AppError.notFound(`Purchase order with ID '${id}' not found`);
    }
    return po;
  }

  async createPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    actor?: { userId: string; email?: string },
  ): Promise<PurchaseOrderEntity> {
    const supplier = await this.suppliersRepo.findSupplierById(dto.supplierId);
    if (!supplier) {
      throw AppError.notFound(`Supplier with ID '${dto.supplierId}' not found`);
    }
    if (!supplier.isActive) {
      throw AppError.badRequest('Cannot create purchase order for an inactive supplier');
    }

    let warehouseId: string | undefined = dto.warehouseId;
    if (!warehouseId) {
      const defaultWh = await prisma.warehouse.findFirst({
        where: { isDefault: true, isActive: true },
      });
      warehouseId = defaultWh?.id;
    }

    if (!dto.items || dto.items.length === 0) {
      throw AppError.badRequest('Purchase order must contain at least one line item');
    }

    // Validate quantities and costs
    let totalAmount = 0;
    for (const item of dto.items) {
      if (item.orderedQuantity <= 0) {
        throw AppError.badRequest('Item ordered quantity must be greater than zero');
      }
      if (item.unitCost < 0) {
        throw AppError.badRequest('Item unit cost cannot be negative');
      }
      totalAmount += item.orderedQuantity * item.unitCost;
    }

    const poNumber = await this.generatePoNumber();

    const created = await this.repo.createPurchaseOrder({
      poNumber,
      supplierId: dto.supplierId,
      warehouseId: warehouseId ?? null,
      status: PurchaseOrderStatus.DRAFT,
      totalAmount: Number(totalAmount.toFixed(2)),
      expectedDeliveryDate: dto.expectedDeliveryDate,
      notes: dto.notes,
      items: dto.items,
    });

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PURCHASE_ORDER_CREATED',
        targetType: 'PURCHASE_ORDER',
        targetId: created.id,
        metadata: {
          poNumber: created.poNumber,
          supplierId: created.supplierId,
          totalAmount: created.totalAmount,
          itemCount: dto.items.length,
        },
      });
    }

    return created;
  }

  /**
   * State Machine Transition Handler
   * Valid transitions:
   *   DRAFT -> ORDERED, CANCELLED
   *   ORDERED -> CANCELLED
   *   PARTIALLY_RECEIVED -> CANCELLED
   * (Receiving transitions to PARTIALLY_RECEIVED / RECEIVED are handled by receivePoItems)
   */
  async updateStatus(
    id: string,
    targetStatus: PurchaseOrderStatus,
    actor?: { userId: string; email?: string },
  ): Promise<PurchaseOrderEntity> {
    const po = await this.getPurchaseOrderById(id);
    const current = po.status;

    if (current === targetStatus) {
      return po;
    }

    // Terminal states cannot transition
    if (current === PurchaseOrderStatus.RECEIVED || current === PurchaseOrderStatus.CANCELLED) {
      throw AppError.badRequest(
        `Cannot transition purchase order from terminal status '${current}' to '${targetStatus}'`,
      );
    }

    // Validate state machine rules
    const allowedTransitions: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
      DRAFT: [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.CANCELLED],
      ORDERED: [PurchaseOrderStatus.CANCELLED],
      PARTIALLY_RECEIVED: [PurchaseOrderStatus.CANCELLED],
      RECEIVED: [],
      CANCELLED: [],
    };

    if (!allowedTransitions[current]?.includes(targetStatus)) {
      throw AppError.badRequest(
        `Invalid status transition from '${current}' to '${targetStatus}'`,
      );
    }

    const extraData: { orderedAt?: Date } = {};
    if (targetStatus === PurchaseOrderStatus.ORDERED) {
      extraData.orderedAt = new Date();
    }

    const updated = await this.repo.updateStatus(id, targetStatus, extraData);

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PURCHASE_ORDER_STATUS_CHANGED',
        targetType: 'PURCHASE_ORDER',
        targetId: id,
        metadata: {
          poNumber: po.poNumber,
          fromStatus: current,
          toStatus: targetStatus,
        },
      });
    }

    return updated;
  }

  /**
   * Receive Goods against Purchase Order
   * - Validates status (must be ORDERED or PARTIALLY_RECEIVED)
   * - Blocks over-receiving
   * - Records StockMovement with referenceType='PURCHASE_ORDER'
   * - Recomputes variant costPrice via calculateWeightedAverageCost
   * - Logs COST_PRICE_UPDATED audit entry
   * - Updates PO status (PARTIALLY_RECEIVED or RECEIVED)
   */
  async receivePoItems(
    id: string,
    dto: ReceivePurchaseOrderDto,
    actor?: { userId: string; email?: string },
  ): Promise<PurchaseOrderEntity> {
    const po = await this.getPurchaseOrderById(id);

    if (
      po.status !== PurchaseOrderStatus.ORDERED &&
      po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw AppError.badRequest(
        `Cannot receive goods against purchase order in status '${po.status}'. Must be ORDERED or PARTIALLY_RECEIVED.`,
      );
    }

    if (!po.warehouseId) {
      throw AppError.badRequest('Purchase order does not have an assigned destination warehouse');
    }

    if (!dto.items || dto.items.length === 0) {
      throw AppError.badRequest('At least one item must be received');
    }

    const poItemsMap = new Map(po.items?.map(item => [item.variantId, item]));

    // Step 1: Pre-validation of all incoming items (Over-receive block)
    for (const incoming of dto.items) {
      if (incoming.quantity <= 0) {
        throw AppError.badRequest('Receive quantity must be greater than zero');
      }

      const poItem = poItemsMap.get(incoming.variantId);
      if (!poItem) {
        throw AppError.badRequest(
          `Variant '${incoming.variantId}' is not part of purchase order '${po.poNumber}'`,
        );
      }

      const remainingAllowed = poItem.orderedQuantity - poItem.receivedQuantity;
      if (incoming.quantity > remainingAllowed) {
        throw AppError.badRequest(
          `Cannot receive ${incoming.quantity} units for variant '${poItem.variant?.sku || incoming.variantId}'. Remaining unreceived quantity is ${remainingAllowed}. Over-receiving is blocked.`,
        );
      }
    }

    // Step 2: Process each received item
    for (const incoming of dto.items) {
      const poItem = poItemsMap.get(incoming.variantId)!;

      // 2a. Atomic stock receive in inventory
      const receiveResult = await this.invService.receiveStock({
        variantId: incoming.variantId,
        warehouseId: po.warehouseId,
        quantity: incoming.quantity,
        referenceType: 'PURCHASE_ORDER',
        referenceId: po.poNumber,
        reason: dto.notes || `Goods receipt against ${po.poNumber}`,
        actorId: actor?.userId,
      });

      // 2b. Weighted average cost recalculation
      const currentOnHandPrior = Math.max(0, receiveResult.inventory.onHand - incoming.quantity);
      const currentCostPrice = poItem.variant?.costPrice ?? 0;
      const newCostPrice = calculateWeightedAverageCost(
        currentOnHandPrior,
        currentCostPrice,
        incoming.quantity,
        poItem.unitCost,
      );

      // Update variant's costPrice in DB
      await prisma.productVariant.update({
        where: { id: incoming.variantId },
        data: { costPrice: newCostPrice },
      });

      // Audit log costPrice update
      if (actor) {
        await this.auditSvc.record({
          actorId: actor.userId,
          actorType: 'USER',
          action: 'COST_PRICE_UPDATED',
          targetType: 'PRODUCT_VARIANT',
          targetId: incoming.variantId,
          metadata: {
            variantId: incoming.variantId,
            poNumber: po.poNumber,
            oldCostPrice: currentCostPrice,
            newCostPrice,
            receivedQty: incoming.quantity,
            unitCost: poItem.unitCost,
          },
        });
      }

      // 2c. Update PO item received quantity
      const newReceivedQty = poItem.receivedQuantity + incoming.quantity;
      await this.repo.updateReceivedQuantity(poItem.id, newReceivedQty);
      poItem.receivedQuantity = newReceivedQty;
    }

    // Step 3: Determine new PO status
    let allFullyReceived = true;
    for (const item of po.items ?? []) {
      if (item.receivedQuantity < item.orderedQuantity) {
        allFullyReceived = false;
        break;
      }
    }

    const nextStatus = allFullyReceived
      ? PurchaseOrderStatus.RECEIVED
      : PurchaseOrderStatus.PARTIALLY_RECEIVED;

    const updatedPo = await this.repo.updateStatus(id, nextStatus, {
      receivedAt: allFullyReceived ? new Date() : undefined,
    });

    if (actor) {
      await this.auditSvc.record({
        actorId: actor.userId,
        actorType: 'USER',
        action: 'PURCHASE_ORDER_RECEIVED',
        targetType: 'PURCHASE_ORDER',
        targetId: id,
        metadata: {
          poNumber: po.poNumber,
          status: nextStatus,
          receivedItemsCount: dto.items.length,
          allFullyReceived,
        },
      });
    }

    return updatedPo;
  }
}

export const purchaseOrdersService = new PurchaseOrdersService();
