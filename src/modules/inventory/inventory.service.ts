import { AppError } from '@/utils/app-error';
import type { Prisma } from '@prisma/client';
import type {
  IInventoryRepository,
  InventoryEntity,
  StockMovementEntity,
  ReceiveStockInput,
  AdjustStockInput,
  ReserveStockInput,
  ReleaseReservationInput,
  CommitReservationInput,
  MarkDamagedInput,
  RestockInput,
  TransferStockInput,
  StockOperationResult,
  TransferStockResult,
  InventoryQueryFilter,
  StockMovementQueryFilter,
  InventorySummaryDto,
} from './inventory.types';
import { inventoryRepository as defaultRepo } from './inventory.repository';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';

import { notificationsService } from '@/modules/notifications/notifications.service';
import { eventBus } from '@/events/event-bus';

export interface IInventoryAlertEmitter {
  emitLowStock(variantId: string, available: number, threshold: number): void;
  emitOutOfStock(variantId: string): void;
}

export class DefaultInventoryAlertEmitter implements IInventoryAlertEmitter {
  emitLowStock(variantId: string, available: number, threshold: number): void {
    eventBus.emitDomainEvent({
      id: `stock_low_${variantId}_${Date.now()}`,
      type: 'stock:low',
      variantId,
      available,
      threshold,
      summary: `Variant ${variantId} is low on stock (${available}/${threshold})`,
      timestamp: new Date().toISOString(),
    });

    void notificationsService.safeNotify({
      channel: 'IN_APP',
      recipient: 'admin',
      template: 'low_stock_alert',
      data: { variantId, available, threshold },
      dedupeKey: `low_stock_${variantId}_${Math.floor(Date.now() / 3600000)}`,
    });
  }

  emitOutOfStock(variantId: string): void {
    eventBus.emitDomainEvent({
      id: `stock_out_${variantId}_${Date.now()}`,
      type: 'stock:low',
      variantId,
      available: 0,
      threshold: 0,
      summary: `Variant ${variantId} is completely out of stock`,
      timestamp: new Date().toISOString(),
    });

    void notificationsService.safeNotify({
      channel: 'IN_APP',
      recipient: 'admin',
      template: 'out_of_stock_alert',
      data: { variantId },
      dedupeKey: `out_of_stock_${variantId}_${Math.floor(Date.now() / 3600000)}`,
    });
  }
}

export class InventoryService {
  constructor(
    private readonly repo: IInventoryRepository = defaultRepo,
    private readonly auditSvc: IAuditService = defaultAuditService,
    private readonly alertEmitter: IInventoryAlertEmitter = new DefaultInventoryAlertEmitter(),
  ) {}

  /**
   * Check stock thresholds after changes and trigger alerts if appropriate
   */
  private checkStockAlerts(inventory: InventoryEntity): void {
    const threshold = inventory.variant?.reorderLevel ?? inventory.safetyStock ?? 5;
    if (inventory.availableStock <= 0) {
      this.alertEmitter.emitOutOfStock(inventory.variantId);
    } else if (inventory.availableStock <= threshold) {
      this.alertEmitter.emitLowStock(inventory.variantId, inventory.availableStock, threshold);
    }
  }

  /**
   * Receive inbound stock (procurement / purchase orders)
   */
  async receiveStock(input: ReceiveStockInput, tx?: Prisma.TransactionClient): Promise<StockOperationResult> {
    if (input.quantity <= 0) {
      throw AppError.badRequest('Received quantity must be greater than zero');
    }

    const result = await this.repo.receiveStock(input, tx);

    if (input.actorId) {
      await this.auditSvc.record({
        actorId: input.actorId,
        actorType: 'USER',
        action: 'STOCK_RECEIVED',
        targetType: 'INVENTORY',
        targetId: result.inventory.id,
        metadata: {
          variantId: input.variantId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        },
      });
    }

    this.checkStockAlerts(result.inventory);
    return result;
  }

  /**
   * Adjust stock level (positive or negative with required reason and actor)
   */
  async adjustStock(input: AdjustStockInput, tx?: Prisma.TransactionClient): Promise<StockOperationResult> {
    if (!input.reason || input.reason.trim().length < 3) {
      throw AppError.badRequest('Adjustment reason is required (min 3 characters)');
    }
    if (!input.actorId) {
      throw AppError.badRequest('Actor ID is required for stock adjustments');
    }
    if (input.quantity === 0) {
      throw AppError.badRequest('Adjustment quantity cannot be zero');
    }

    const result = await this.repo.adjustStock(input, tx);

    await this.auditSvc.record({
      actorId: input.actorId,
      actorType: 'USER',
      action: 'STOCK_ADJUSTED',
      targetType: 'INVENTORY',
      targetId: result.inventory.id,
      metadata: {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        reason: input.reason,
      },
    });

    this.checkStockAlerts(result.inventory);
    return result;
  }

  /**
   * Reserve stock (idempotent, checkout / placed orders)
   */
  async reserveStock(input: ReserveStockInput, tx?: Prisma.TransactionClient): Promise<StockOperationResult> {
    if (input.quantity <= 0) {
      throw AppError.badRequest('Reservation quantity must be greater than zero');
    }

    const result = await this.repo.reserveStock(input, tx);
    this.checkStockAlerts(result.inventory);
    return result;
  }

  /**
   * Release reserved stock (idempotent, payment failure / expired checkout / cancellation)
   */
  async releaseReservation(input: ReleaseReservationInput, tx?: Prisma.TransactionClient): Promise<StockOperationResult> {
    if (input.quantity <= 0) {
      throw AppError.badRequest('Release quantity must be greater than zero');
    }

    const result = await this.repo.releaseReservation(input, tx);
    this.checkStockAlerts(result.inventory);
    return result;
  }

  /**
   * Commit reservation upon order confirmation / fulfillment / dispatch
   */
  async commitReservation(input: CommitReservationInput, tx?: Prisma.TransactionClient): Promise<StockOperationResult> {
    if (input.quantity <= 0) {
      throw AppError.badRequest('Commit quantity must be greater than zero');
    }

    const result = await this.repo.commitReservation(input, tx);
    this.checkStockAlerts(result.inventory);
    return result;
  }

  /**
   * Mark damaged stock and quarantine from available inventory
   */
  async markDamaged(input: MarkDamagedInput): Promise<StockOperationResult> {
    if (input.quantity <= 0) {
      throw AppError.badRequest('Damaged quantity must be greater than zero');
    }
    if (!input.reason || input.reason.trim().length < 3) {
      throw AppError.badRequest('Damage reason is required (min 3 characters)');
    }
    if (!input.actorId) {
      throw AppError.badRequest('Actor ID is required for marking damaged stock');
    }

    const result = await this.repo.markDamaged(input);

    await this.auditSvc.record({
      actorId: input.actorId,
      actorType: 'USER',
      action: 'STOCK_MARKED_DAMAGED',
      targetType: 'INVENTORY',
      targetId: result.inventory.id,
      metadata: {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        reason: input.reason,
      },
    });

    this.checkStockAlerts(result.inventory);
    return result;
  }

  /**
   * Restock items from returns or order cancellations
   */
  async restock(input: RestockInput): Promise<StockOperationResult> {
    if (input.quantity <= 0) {
      throw AppError.badRequest('Restock quantity must be greater than zero');
    }

    const result = await this.repo.restock(input);
    this.checkStockAlerts(result.inventory);
    return result;
  }

  /**
   * Multi-warehouse transfer with deterministic lock order
   */
  async transferStock(input: TransferStockInput): Promise<TransferStockResult> {
    if (input.quantity <= 0) {
      throw AppError.badRequest('Transfer quantity must be greater than zero');
    }
    if (!input.reason || input.reason.trim().length < 3) {
      throw AppError.badRequest('Transfer reason is required (min 3 characters)');
    }
    if (input.sourceWarehouseId === input.targetWarehouseId) {
      throw AppError.badRequest('Source and destination warehouse cannot be the same');
    }

    const result = await this.repo.transferStock(input);

    if (input.actorId) {
      await this.auditSvc.record({
        actorId: input.actorId,
        actorType: 'USER',
        action: 'STOCK_TRANSFERRED',
        targetType: 'INVENTORY',
        targetId: result.sourceInventory.id,
        metadata: {
          variantId: input.variantId,
          from: input.sourceWarehouseId,
          to: input.targetWarehouseId,
          quantity: input.quantity,
          reason: input.reason,
        },
      });
    }

    this.checkStockAlerts(result.sourceInventory);
    return result;
  }

  /**
   * Release expired reservations (e.g. checkout TTL exceeded)
   */
  async releaseExpiredReservations(before: Date): Promise<{ releasedCount: number }> {
    const expiredList = await this.repo.findExpiredReservations(before);
    let releasedCount = 0;

    for (const exp of expiredList) {
      try {
        await this.releaseReservation({
          variantId: exp.variantId,
          warehouseId: exp.warehouseId,
          quantity: exp.quantity,
          referenceType: 'CHECKOUT',
          referenceId: exp.referenceId,
          reason: 'Reservation expired due to TTL timeout',
        });
        releasedCount++;
      } catch {
        // Continue processing remaining expired items
      }
    }

    return { releasedCount };
  }

  async getInventoryByVariant(
    variantId: string,
    warehouseId?: string,
  ): Promise<InventoryEntity[]> {
    if (warehouseId) {
      const inv = await this.repo.findInventory(variantId, warehouseId);
      return inv ? [inv] : [];
    }
    const res = await this.repo.listInventory({ search: variantId, limit: 100 });
    return res.items.filter(i => i.variantId === variantId);
  }

  async listInventory(
    filter: InventoryQueryFilter,
  ): Promise<{ items: InventoryEntity[]; total: number }> {
    return this.repo.listInventory(filter);
  }

  async listLowStock(
    warehouseId?: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: InventoryEntity[]; total: number }> {
    return this.repo.listLowStock(warehouseId, page, limit);
  }

  async listMovements(
    filter: StockMovementQueryFilter,
  ): Promise<{ items: StockMovementEntity[]; total: number }> {
    return this.repo.listMovements(filter);
  }

  async getSummary(
    userHasCostPermission: boolean,
    warehouseId?: string,
  ): Promise<InventorySummaryDto> {
    const summary = await this.repo.getInventorySummary(warehouseId);

    if (!userHasCostPermission) {
      // Strip confidential cost/valuation figures
      return {
        totalProducts: summary.totalProducts,
        totalStockUnits: summary.totalStockUnits,
        available: summary.available,
        reserved: summary.reserved,
        damaged: summary.damaged,
      };
    }

    return summary;
  }
}

export const inventoryService = new InventoryService();
