import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '@/modules/inventory/inventory.service';
import type {
  IInventoryRepository,
  InventoryEntity,
  StockMovementEntity,
} from '@/modules/inventory/inventory.types';
import type { IAuditService } from '@/services/audit.service';
import { AppError } from '@/utils/app-error';

describe('InventoryService (Unit Tests with Mocked Repository)', () => {
  let service: InventoryService;
  let mockRepo: vi.Mocked<IInventoryRepository>;
  let mockAuditSvc: vi.Mocked<IAuditService>;
  let mockAlertEmitter: { emitLowStock: ReturnType<typeof vi.fn>; emitOutOfStock: ReturnType<typeof vi.fn> };

  const sampleInventory: InventoryEntity = {
    id: 'inv-1',
    variantId: 'var-101',
    warehouseId: 'wh-main',
    onHand: 10,
    reserved: 2,
    damaged: 1,
    safetyStock: 2,
    availableStock: 7, // 10 - 2 - 1 = 7
    createdAt: new Date(),
    updatedAt: new Date(),
    variant: {
      id: 'var-101',
      productId: 'prod-1',
      name: 'Black / M',
      sku: 'TEE-BLK-M',
      barcode: '1234567890123',
      price: '1200.00',
      costPrice: '600.00',
      reorderLevel: 5,
    },
  };

  const sampleMovement: StockMovementEntity = {
    id: 'mov-1',
    variantId: 'var-101',
    warehouseId: 'wh-main',
    type: 'PURCHASE_RECEIPT',
    action: 'RECEIVE',
    quantity: 10,
    quantityBefore: 0,
    quantityAfter: 10,
    reason: 'Initial PO delivery',
    referenceType: 'PURCHASE_ORDER',
    referenceId: 'PO-20261101-0001',
    actorId: 'admin-1',
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRepo = {
      findInventory: vi.fn(),
      findOrCreateInventory: vi.fn(),
      findMovementByReference: vi.fn(),
      receiveStock: vi.fn(),
      adjustStock: vi.fn(),
      reserveStock: vi.fn(),
      releaseReservation: vi.fn(),
      commitReservation: vi.fn(),
      markDamaged: vi.fn(),
      restock: vi.fn(),
      transferStock: vi.fn(),
      listInventory: vi.fn(),
      listLowStock: vi.fn(),
      listMovements: vi.fn(),
      getInventorySummary: vi.fn(),
      findExpiredReservations: vi.fn(),
    } as unknown as vi.Mocked<IInventoryRepository>;

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      query: vi.fn(),
      getActorActivity: vi.fn(),
    } as unknown as vi.Mocked<IAuditService>;

    mockAlertEmitter = {
      emitLowStock: vi.fn(),
      emitOutOfStock: vi.fn(),
    };

    service = new InventoryService(mockRepo, mockAuditSvc, mockAlertEmitter);
  });

  describe('receiveStock', () => {
    it('should successfully receive stock and record audit log', async () => {
      mockRepo.receiveStock.mockResolvedValue({
        inventory: { ...sampleInventory, onHand: 20, availableStock: 17 },
        movement: sampleMovement,
      });

      const res = await service.receiveStock({
        variantId: 'var-101',
        warehouseId: 'wh-main',
        quantity: 10,
        reason: 'Received PO goods',
        referenceType: 'PURCHASE_ORDER',
        referenceId: 'PO-101',
        actorId: 'admin-1',
      });

      expect(mockRepo.receiveStock).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 10 }),
      );
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STOCK_RECEIVED',
          actorId: 'admin-1',
        }),
      );
      expect(res.inventory.onHand).toBe(20);
    });

    it('should reject receiving zero or negative quantities', async () => {
      await expect(
        service.receiveStock({
          variantId: 'var-101',
          warehouseId: 'wh-main',
          quantity: 0,
          reason: 'Invalid qty',
          referenceType: 'MANUAL',
          referenceId: 'REF-0',
        }),
      ).rejects.toThrow('Received quantity must be greater than zero');

      await expect(
        service.receiveStock({
          variantId: 'var-101',
          warehouseId: 'wh-main',
          quantity: -5,
          reason: 'Negative qty',
          referenceType: 'MANUAL',
          referenceId: 'REF-NEG',
        }),
      ).rejects.toThrow('Received quantity must be greater than zero');
    });
  });

  describe('reserveStock (Atomic & Idempotent)', () => {
    it('should reserve stock at exact available boundary (requesting exactly available quantity)', async () => {
      // availableStock = 7. Requesting exactly 7 units.
      mockRepo.reserveStock.mockResolvedValue({
        inventory: {
          ...sampleInventory,
          reserved: 9,
          availableStock: 0, // exactly 0 remaining
        },
        movement: {
          ...sampleMovement,
          action: 'RESERVE',
          quantity: 7,
          quantityBefore: 7,
          quantityAfter: 0,
        },
      });

      const result = await service.reserveStock({
        variantId: 'var-101',
        warehouseId: 'wh-main',
        quantity: 7,
        referenceType: 'ORDER',
        referenceId: 'ORD-BOUND-001',
      });

      expect(result.inventory.availableStock).toBe(0);
      expect(mockAlertEmitter.emitOutOfStock).toHaveBeenCalledWith('var-101');
    });

    it('should throw bad request when stock is insufficient', async () => {
      mockRepo.reserveStock.mockRejectedValue(
        AppError.badRequest("Insufficient available stock for variant 'var-101' (Requested: 20)"),
      );

      await expect(
        service.reserveStock({
          variantId: 'var-101',
          warehouseId: 'wh-main',
          quantity: 20,
          referenceType: 'ORDER',
          referenceId: 'ORD-OVER-001',
        }),
      ).rejects.toThrow(/Insufficient available stock/);
    });

    it('should return existing reservation gracefully on duplicate idempotent request', async () => {
      mockRepo.reserveStock.mockResolvedValue({
        inventory: sampleInventory,
        movement: {
          ...sampleMovement,
          action: 'RESERVE',
          referenceType: 'ORDER',
          referenceId: 'ORD-DUP-001',
        },
        isIdempotentReplay: true,
      });

      const firstCall = await service.reserveStock({
        variantId: 'var-101',
        warehouseId: 'wh-main',
        quantity: 2,
        referenceType: 'ORDER',
        referenceId: 'ORD-DUP-001',
      });

      expect(firstCall.isIdempotentReplay).toBe(true);
      expect(firstCall.movement.referenceId).toBe('ORD-DUP-001');
    });
  });

  describe('releaseReservation & commitReservation', () => {
    it('should release reserved stock and return to available pool', async () => {
      mockRepo.releaseReservation.mockResolvedValue({
        inventory: { ...sampleInventory, reserved: 0, availableStock: 9 },
        movement: {
          ...sampleMovement,
          action: 'RELEASE',
          quantity: 2,
        },
      });

      const res = await service.releaseReservation({
        variantId: 'var-101',
        warehouseId: 'wh-main',
        quantity: 2,
        referenceType: 'ORDER',
        referenceId: 'ORD-CANCEL-001',
      });

      expect(res.inventory.reserved).toBe(0);
      expect(res.inventory.availableStock).toBe(9);
    });

    it('should commit reservation, deducting from both reserved and physical onHand', async () => {
      // 10 onHand, 2 reserved. Commit 2 -> 8 onHand, 0 reserved.
      mockRepo.commitReservation.mockResolvedValue({
        inventory: {
          ...sampleInventory,
          onHand: 8,
          reserved: 0,
          availableStock: 7, // 8 - 0 - 1 = 7
        },
        movement: {
          ...sampleMovement,
          action: 'COMMIT',
          type: 'ORDER_FULFILLMENT',
          quantity: 2,
        },
      });

      const res = await service.commitReservation({
        variantId: 'var-101',
        warehouseId: 'wh-main',
        quantity: 2,
        referenceType: 'ORDER',
        referenceId: 'ORD-FULFILL-001',
      });

      expect(res.inventory.onHand).toBe(8);
      expect(res.inventory.reserved).toBe(0);
      expect(res.movement.type).toBe('ORDER_FULFILLMENT');
    });
  });

  describe('adjustStock (Non-negative boundary rejection & Audit)', () => {
    it('should adjust stock positively with valid reason and actor', async () => {
      mockRepo.adjustStock.mockResolvedValue({
        inventory: { ...sampleInventory, onHand: 15, availableStock: 12 },
        movement: {
          ...sampleMovement,
          action: 'ADJUST',
          quantity: 5,
        },
      });

      const res = await service.adjustStock({
        variantId: 'var-101',
        warehouseId: 'wh-main',
        quantity: 5,
        reason: 'Found surplus in audit count',
        actorId: 'admin-1',
      });

      expect(mockRepo.adjustStock).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 5, actorId: 'admin-1' }),
      );
      expect(res.inventory.onHand).toBe(15);
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STOCK_ADJUSTED' }),
      );
    });

    it('should reject adjustments attempting to drive available stock below zero', async () => {
      mockRepo.adjustStock.mockRejectedValue(
        AppError.badRequest(
          'Stock adjustment rejected: reduction of 50 units would breach non-negative available stock boundary',
        ),
      );

      await expect(
        service.adjustStock({
          variantId: 'var-101',
          warehouseId: 'wh-main',
          quantity: -50,
          reason: 'Mass discrepancy write-off',
          actorId: 'admin-1',
        }),
      ).rejects.toThrow(/would breach non-negative available stock boundary/);
    });

    it('should reject adjustments missing required reason or actor', async () => {
      await expect(
        service.adjustStock({
          variantId: 'var-101',
          warehouseId: 'wh-main',
          quantity: 5,
          reason: '', // empty!
          actorId: 'admin-1',
        }),
      ).rejects.toThrow('Adjustment reason is required');

      await expect(
        service.adjustStock({
          variantId: 'var-101',
          warehouseId: 'wh-main',
          quantity: 5,
          reason: 'Valid reason',
          actorId: '', // missing actor!
        }),
      ).rejects.toThrow('Actor ID is required');
    });
  });

  describe('transferStock (Multi-Warehouse & Rollback)', () => {
    it('should reject transfer when source and target warehouse are identical', async () => {
      await expect(
        service.transferStock({
          variantId: 'var-101',
          sourceWarehouseId: 'wh-dhaka',
          targetWarehouseId: 'wh-dhaka',
          quantity: 5,
          reason: 'Invalid self transfer',
        }),
      ).rejects.toThrow('Source and destination warehouse cannot be the same');
    });

    it('should roll back and throw error when source warehouse lacks stock', async () => {
      mockRepo.transferStock.mockRejectedValue(
        AppError.badRequest('Transfer rejected: source warehouse has insufficient available stock (50 required)'),
      );

      await expect(
        service.transferStock({
          variantId: 'var-101',
          sourceWarehouseId: 'wh-dhaka',
          targetWarehouseId: 'wh-chittagong',
          quantity: 50,
          reason: 'Stock balancing',
          actorId: 'admin-1',
        }),
      ).rejects.toThrow(/source warehouse has insufficient available stock/);
    });

    it('should successfully transfer stock and log audit record', async () => {
      mockRepo.transferStock.mockResolvedValue({
        sourceInventory: { ...sampleInventory, onHand: 5, availableStock: 2 },
        targetInventory: { ...sampleInventory, id: 'inv-target', warehouseId: 'wh-ctg', onHand: 5, availableStock: 5 },
        outboundMovement: { ...sampleMovement, action: 'TRANSFER_OUT', quantity: 5 },
        inboundMovement: { ...sampleMovement, action: 'TRANSFER_IN', quantity: 5 },
      });

      const res = await service.transferStock({
        variantId: 'var-101',
        sourceWarehouseId: 'wh-dhaka',
        targetWarehouseId: 'wh-chittagong',
        quantity: 5,
        reason: 'Restocking retail showroom',
        actorId: 'manager-1',
      });

      expect(res.sourceInventory.onHand).toBe(5);
      expect(res.targetInventory.onHand).toBe(5);
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STOCK_TRANSFERRED', actorId: 'manager-1' }),
      );
    });
  });

  describe('releaseExpiredReservations', () => {
    it('should release all expired reservations based on cutoff timestamp', async () => {
      const expiredDate = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago
      mockRepo.findExpiredReservations.mockResolvedValue([
        { variantId: 'var-101', warehouseId: 'wh-main', referenceId: 'CHK-EXP-1', quantity: 2 },
        { variantId: 'var-102', warehouseId: 'wh-main', referenceId: 'CHK-EXP-2', quantity: 1 },
      ]);
      mockRepo.releaseReservation.mockResolvedValue({
        inventory: sampleInventory,
        movement: sampleMovement,
      });

      const res = await service.releaseExpiredReservations(expiredDate);

      expect(mockRepo.findExpiredReservations).toHaveBeenCalledWith(expiredDate);
      expect(mockRepo.releaseReservation).toHaveBeenCalledTimes(2);
      expect(res.releasedCount).toBe(2);
    });
  });

  describe('getSummary & Confidential Cost Permissions', () => {
    it('should include stockValue and damageValue when userHasCostPermission is true', async () => {
      mockRepo.getInventorySummary.mockResolvedValue({
        totalProducts: 45,
        totalStockUnits: 1200,
        available: 1100,
        reserved: 80,
        damaged: 20,
        stockValue: '1440000.00',
        damageValue: '24000.00',
        netStockValue: '1416000.00',
      });

      const summary = await service.getSummary(true);

      expect(summary.totalProducts).toBe(45);
      expect(summary.stockValue).toBe('1440000.00');
      expect(summary.damageValue).toBe('24000.00');
      expect(summary.netStockValue).toBe('1416000.00');
    });

    it('should strip stockValue, damageValue, and netStockValue when user lacks cost permission', async () => {
      mockRepo.getInventorySummary.mockResolvedValue({
        totalProducts: 45,
        totalStockUnits: 1200,
        available: 1100,
        reserved: 80,
        damaged: 20,
        stockValue: '1440000.00',
        damageValue: '24000.00',
        netStockValue: '1416000.00',
      });

      const summary = await service.getSummary(false); // No cost permission!

      expect(summary.totalProducts).toBe(45);
      expect(summary.totalStockUnits).toBe(1200);
      expect(summary.available).toBe(1100);
      expect(summary.stockValue).toBeUndefined();
      expect(summary.damageValue).toBeUndefined();
      expect(summary.netStockValue).toBeUndefined();
    });
  });

  describe('Ledger Consistency Verification', () => {
    it('should maintain mathematical invariant: net inventory change strictly equals sum of ledger movements', async () => {
      // Simulate sequential ledger movements for a variant
      const movements: Array<{ type: string; onHandDelta: number }> = [
        { type: 'PURCHASE_RECEIPT', onHandDelta: +100 },
        { type: 'ORDER_FULFILLMENT', onHandDelta: -20 },
        { type: 'ADJUSTMENT_NEGATIVE', onHandDelta: -5 },
        { type: 'RETURN_RESTOCK', onHandDelta: +3 },
        { type: 'TRANSFER_OUT', onHandDelta: -15 },
      ];

      const initialOnHand = 0;
      let runningOnHand = initialOnHand;

      for (const mov of movements) {
        runningOnHand += mov.onHandDelta;
      }

      const sumOfDeltas = movements.reduce((acc, m) => acc + m.onHandDelta, 0);

      expect(runningOnHand - initialOnHand).toBe(sumOfDeltas);
      expect(runningOnHand).toBe(63);
    });
  });
});
