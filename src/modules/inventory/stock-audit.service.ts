import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { inventoryRepository } from './inventory.repository';
import { inventoryService } from './inventory.service';
import { stockAuditRepository } from './stock-audit.repository';
import type {
  IStockAuditRepository,
  StockAuditEntity,
  StartAuditInput,
  RecordAuditCountsInput,
} from './stock-audit.types';

export class StockAuditService {
  constructor(
    private readonly repo: IStockAuditRepository = stockAuditRepository,
    private readonly invRepo = inventoryRepository,
    private readonly invService = inventoryService,
    private readonly auditSvc: IAuditService = auditService,
  ) {}

  async startAudit(input: StartAuditInput): Promise<StockAuditEntity> {
    const audit = await this.repo.createAudit(input);

    await this.auditSvc.record({
      actorId: input.auditorId,
      actorType: 'USER',
      action: 'STOCK_AUDIT_STARTED',
      targetType: 'STOCK_AUDIT',
      targetId: audit.id,
      metadata: {
        warehouseId: input.warehouseId,
      },
    });

    return audit;
  }

  async getAuditById(id: string): Promise<StockAuditEntity> {
    const audit = await this.repo.findAuditById(id);
    if (!audit) {
      throw AppError.notFound(`Stock audit with ID '${id}' not found`);
    }
    return audit;
  }

  async listAudits(warehouseId?: string): Promise<StockAuditEntity[]> {
    return this.repo.listAudits(warehouseId);
  }

  /**
   * Record physical count entries and calculate variances
   */
  async recordCounts(input: RecordAuditCountsInput, actorId?: string): Promise<StockAuditEntity> {
    const audit = await this.getAuditById(input.auditId);

    if (audit.status !== 'IN_PROGRESS') {
      throw AppError.badRequest(`Cannot enter counts for an audit in status '${audit.status}'`);
    }

    if (!input.items || input.items.length === 0) {
      throw AppError.badRequest('At least one count entry is required');
    }

    let discrepancies = 0;

    for (const item of input.items) {
      if (item.countedQuantity < 0) {
        throw AppError.badRequest('Counted quantity cannot be negative');
      }

      // Fetch current system on-hand
      const inventory = await this.invRepo.findInventory(item.variantId, audit.warehouseId);
      const systemQuantity = inventory?.onHand ?? 0;
      const variance = item.countedQuantity - systemQuantity;

      if (variance !== 0) {
        discrepancies++;
      }

      await this.repo.upsertAuditItem({
        auditId: audit.id,
        variantId: item.variantId,
        systemQuantity,
        countedQuantity: item.countedQuantity,
        variance,
        notes: item.notes,
      });
    }

    // Refresh audit
    const updated = await this.repo.updateAuditStatus(audit.id, 'IN_PROGRESS', discrepancies);

    if (actorId) {
      await this.auditSvc.record({
        actorId,
        actorType: 'USER',
        action: 'STOCK_AUDIT_COUNTS_RECORDED',
        targetType: 'STOCK_AUDIT',
        targetId: audit.id,
        metadata: {
          itemsCounted: input.items.length,
          discrepancies,
        },
      });
    }

    return updated;
  }

  /**
   * Approve Stock Audit:
   * Reconciles physical count differences strictly via ledger adjustment movements!
   * NEVER updates inventory directly.
   */
  async approveAudit(id: string, approverId: string): Promise<StockAuditEntity> {
    const audit = await this.getAuditById(id);

    if (audit.status !== 'IN_PROGRESS') {
      throw AppError.badRequest(`Cannot approve an audit in status '${audit.status}'`);
    }

    // Process all variances through inventoryService.adjustStock
    for (const item of audit.items ?? []) {
      if (item.variance !== 0) {
        await this.invService.adjustStock({
          variantId: item.variantId,
          warehouseId: audit.warehouseId,
          quantity: item.variance,
          reason: `Stock audit reconciliation [Audit ID: ${audit.id}]. Variance: ${item.variance > 0 ? '+' : ''}${item.variance}`,
          actorId: approverId,
        });
      }
    }

    const updated = await this.repo.updateAuditStatus(id, 'APPROVED', undefined, new Date());

    await this.auditSvc.record({
      actorId: approverId,
      actorType: 'USER',
      action: 'STOCK_AUDIT_APPROVED',
      targetType: 'STOCK_AUDIT',
      targetId: id,
      metadata: {
        warehouseId: audit.warehouseId,
        reconciledItems: audit.items?.filter(i => i.variance !== 0).length ?? 0,
      },
    });

    return updated;
  }

  async rejectAudit(id: string, rejecterId: string, reason?: string): Promise<StockAuditEntity> {
    const audit = await this.getAuditById(id);

    if (audit.status !== 'IN_PROGRESS') {
      throw AppError.badRequest(`Cannot reject an audit in status '${audit.status}'`);
    }

    const updated = await this.repo.updateAuditStatus(id, 'REJECTED', undefined, new Date());

    await this.auditSvc.record({
      actorId: rejecterId,
      actorType: 'USER',
      action: 'STOCK_AUDIT_REJECTED',
      targetType: 'STOCK_AUDIT',
      targetId: id,
      metadata: {
        reason,
      },
    });

    return updated;
  }
}

export const stockAuditService = new StockAuditService();
