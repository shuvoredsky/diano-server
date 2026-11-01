import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StockAuditService } from '@/modules/inventory/stock-audit.service';
import type {
  IStockAuditRepository,
  StockAuditEntity,
} from '@/modules/inventory/stock-audit.types';
import type { IInventoryRepository } from '@/modules/inventory/inventory.types';
import type { InventoryService } from '@/modules/inventory/inventory.service';
import type { IAuditService } from '@/services/audit.service';
import { AppError } from '@/utils/app-error';

describe('StockAuditService (Unit Tests: Variance & Ledger Reconciliation)', () => {
  let service: StockAuditService;
  let mockRepo: IStockAuditRepository;
  let mockInvRepo: IInventoryRepository;
  let mockInvService: InventoryService;
  let mockAudit: IAuditService;

  const mockAuditRecord: StockAuditEntity = {
    id: 'audit-1',
    warehouseId: 'wh-1',
    auditorId: 'auditor-1',
    status: 'IN_PROGRESS',
    discrepanciesFound: 0,
    notes: 'Quarterly Physical Count',
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-1',
        auditId: 'audit-1',
        variantId: 'var-1',
        systemQuantity: 20,
        countedQuantity: 18,
        variance: -2, // 2 missing units
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'item-2',
        auditId: 'audit-1',
        variantId: 'var-2',
        systemQuantity: 10,
        countedQuantity: 15,
        variance: +5, // 5 surplus units
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'item-3',
        auditId: 'audit-1',
        variantId: 'var-3',
        systemQuantity: 5,
        countedQuantity: 5,
        variance: 0, // exact match
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRepo = {
      createAudit: vi.fn().mockResolvedValue(mockAuditRecord),
      findAuditById: vi.fn().mockResolvedValue(mockAuditRecord),
      listAudits: vi.fn().mockResolvedValue([mockAuditRecord]),
      upsertAuditItem: vi.fn().mockImplementation(async data => ({
        id: 'audit-item-id',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      updateAuditStatus: vi.fn().mockImplementation(async (id, status, disc, completedAt) => ({
        ...mockAuditRecord,
        status,
        ...(disc !== undefined ? { discrepanciesFound: disc } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
      })),
    };

    mockInvRepo = {
      findInventory: vi.fn().mockImplementation(async (variantId: string) => {
        if (variantId === 'var-1') return { id: 'inv-1', variantId: 'var-1', onHand: 20 };
        if (variantId === 'var-2') return { id: 'inv-2', variantId: 'var-2', onHand: 10 };
        return { id: 'inv-3', variantId: 'var-3', onHand: 5 };
      }),
    } as unknown as IInventoryRepository;

    mockInvService = {
      adjustStock: vi.fn().mockResolvedValue({
        inventory: { id: 'inv-1', onHand: 18 },
        movement: { id: 'mov-adj', type: 'AUDIT_ADJUSTMENT' },
      }),
    } as unknown as InventoryService;

    mockAudit = {
      record: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;

    service = new StockAuditService(mockRepo, mockInvRepo, mockInvService, mockAudit);
  });

  describe('startAudit', () => {
    it('should initialize a stock audit in IN_PROGRESS status and record audit log', async () => {
      const result = await service.startAudit({
        warehouseId: 'wh-1',
        auditorId: 'auditor-1',
        notes: 'Annual audit',
      });

      expect(mockRepo.createAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseId: 'wh-1',
          auditorId: 'auditor-1',
        }),
      );
      expect(result.status).toBe('IN_PROGRESS');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STOCK_AUDIT_STARTED',
        }),
      );
    });
  });

  describe('recordCounts', () => {
    it('should calculate variances against system on-hand correctly', async () => {
      await service.recordCounts({
        auditId: 'audit-1',
        items: [
          { variantId: 'var-1', countedQuantity: 18 }, // system 20 -> variance -2
          { variantId: 'var-2', countedQuantity: 15 }, // system 10 -> variance +5
        ],
      });

      expect(mockRepo.upsertAuditItem).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-1',
          systemQuantity: 20,
          countedQuantity: 18,
          variance: -2,
        }),
      );

      expect(mockRepo.upsertAuditItem).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-2',
          systemQuantity: 10,
          countedQuantity: 15,
          variance: 5,
        }),
      );

      expect(mockRepo.updateAuditStatus).toHaveBeenCalledWith('audit-1', 'IN_PROGRESS', 2);
    });

    it('should reject count entries on completed or approved audit', async () => {
      vi.spyOn(mockRepo, 'findAuditById').mockResolvedValue({
        ...mockAuditRecord,
        status: 'APPROVED',
      });

      await expect(
        service.recordCounts({
          auditId: 'audit-1',
          items: [{ variantId: 'var-1', countedQuantity: 18 }],
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('approveAudit (Ledger Reconciliation)', () => {
    it('should adjust discrepancies strictly through inventoryService.adjustStock via ledger', async () => {
      const result = await service.approveAudit('audit-1', 'admin-supervisor');

      // var-1 had variance -2
      expect(mockInvService.adjustStock).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: -2,
          actorId: 'admin-supervisor',
        }),
      );

      // var-2 had variance +5
      expect(mockInvService.adjustStock).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-2',
          warehouseId: 'wh-1',
          quantity: 5,
          actorId: 'admin-supervisor',
        }),
      );

      // var-3 had variance 0, so adjustStock should NOT be called for var-3
      expect(mockInvService.adjustStock).toHaveBeenCalledTimes(2);

      // Status should be APPROVED with completion timestamp
      expect(mockRepo.updateAuditStatus).toHaveBeenCalledWith(
        'audit-1',
        'APPROVED',
        undefined,
        expect.any(Date),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('should reject approval of non-IN_PROGRESS audit', async () => {
      vi.spyOn(mockRepo, 'findAuditById').mockResolvedValue({
        ...mockAuditRecord,
        status: 'REJECTED',
      });

      await expect(
        service.approveAudit('audit-1', 'admin-supervisor'),
      ).rejects.toThrow(AppError);
    });
  });

  describe('rejectAudit', () => {
    it('should reject audit and make NO stock adjustments', async () => {
      const result = await service.rejectAudit('audit-1', 'admin-supervisor', 'Count procedure flawed');

      expect(result.status).toBe('REJECTED');
      expect(mockInvService.adjustStock).not.toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STOCK_AUDIT_REJECTED',
        }),
      );
    });
  });
});
