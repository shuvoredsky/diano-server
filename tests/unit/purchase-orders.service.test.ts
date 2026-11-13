import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurchaseOrdersService } from '@/modules/purchase-orders/purchase-orders.service';
import type {
  IPurchaseOrdersRepository,
  PurchaseOrderEntity,
} from '@/modules/purchase-orders/purchase-orders.types';
import type { InventoryService } from '@/modules/inventory/inventory.service';
import type { IAuditService } from '@/services/audit.service';
import type { ISuppliersRepository } from '@/modules/suppliers/suppliers.types';
import { AppError } from '@/utils/app-error';
import { PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '@/config/database';

describe('PurchaseOrdersService (Unit Tests: State Machine & Receiving)', () => {
  let service: PurchaseOrdersService;
  let mockRepo: IPurchaseOrdersRepository;
  let mockInvService: InventoryService;
  let mockAudit: IAuditService;
  let mockSuppliersRepo: ISuppliersRepository;

  const mockPo: PurchaseOrderEntity = {
    id: 'po-1',
    poNumber: 'PO-20261101-ABCD',
    supplierId: 'sup-1',
    warehouseId: 'wh-1',
    status: PurchaseOrderStatus.DRAFT,
    totalAmount: 1000,
    orderedAt: null,
    expectedDeliveryDate: null,
    receivedAt: null,
    notes: 'Initial test PO',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-1',
        purchaseOrderId: 'po-1',
        variantId: 'var-1',
        orderedQuantity: 10,
        receivedQuantity: 0,
        unitCost: 100,
        lineTotal: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
        variant: {
          id: 'var-1',
          sku: 'SKU-SHOE-42',
          name: 'Leather Shoe Size 42',
          costPrice: 80,
        },
      },
    ],
  };

  let testPo: PurchaseOrderEntity;

  beforeEach(() => {
    vi.restoreAllMocks();

    testPo = {
      ...mockPo,
      items: [
        {
          ...mockPo.items![0],
          variant: { ...mockPo.items![0].variant! },
        },
      ],
    };

    mockRepo = {
      listPurchaseOrders: vi.fn().mockResolvedValue({ items: [testPo], total: 1 }),
      findPurchaseOrderById: vi.fn().mockImplementation(async () => ({ ...testPo, items: [{ ...testPo.items![0] }] })),
      findPurchaseOrderByPoNumber: vi.fn().mockResolvedValue(null),
      createPurchaseOrder: vi.fn().mockResolvedValue(testPo),
      updateStatus: vi.fn().mockImplementation(async (id, status, extra) => {
        testPo.status = status;
        return {
          ...testPo,
          status,
          ...extra,
        };
      }),
      updateReceivedQuantity: vi.fn().mockImplementation(async (itemId, qty) => {
        testPo.items![0].receivedQuantity = qty;
        return {
          ...testPo.items![0],
          receivedQuantity: qty,
        };
      }),
    };

    mockInvService = {
      receiveStock: vi.fn().mockResolvedValue({
        inventory: { id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1', onHand: 15, available: 15 },
        movement: { id: 'mov-1', type: 'PURCHASE_RECEIPT', quantity: 5 },
      }),
    } as unknown as InventoryService;

    mockAudit = {
      record: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;

    mockSuppliersRepo = {
      findSupplierById: vi.fn().mockResolvedValue({ id: 'sup-1', name: 'Apex', isActive: true }),
    } as unknown as ISuppliersRepository;

    vi.spyOn(prisma.productVariant, 'update').mockResolvedValue({} as never);
    vi.spyOn(prisma, '$transaction').mockImplementation(((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        ...prisma,
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'po-1' }]),
      })) as never,
    );

    service = new PurchaseOrdersService(mockRepo, mockInvService, mockAudit, mockSuppliersRepo);
  });

  describe('State Machine Transitions', () => {
    it('should transition from DRAFT to ORDERED and record orderedAt timestamp', async () => {
      const result = await service.updateStatus('po-1', PurchaseOrderStatus.ORDERED, {
        userId: 'admin-1',
      });

      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        'po-1',
        PurchaseOrderStatus.ORDERED,
        expect.objectContaining({ orderedAt: expect.any(Date) }),
      );
      expect(result.status).toBe(PurchaseOrderStatus.ORDERED);
    });

    it('should transition from DRAFT to CANCELLED', async () => {
      const result = await service.updateStatus('po-1', PurchaseOrderStatus.CANCELLED);
      expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
    });

    it('should transition from ORDERED to CANCELLED', async () => {
      vi.spyOn(mockRepo, 'findPurchaseOrderById').mockResolvedValue({
        ...mockPo,
        status: PurchaseOrderStatus.ORDERED,
      });

      const result = await service.updateStatus('po-1', PurchaseOrderStatus.CANCELLED);
      expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
    });

    it('should reject invalid transition from DRAFT to RECEIVED', async () => {
      await expect(
        service.updateStatus('po-1', PurchaseOrderStatus.RECEIVED),
      ).rejects.toThrow(AppError);
    });

    it('should reject transitions from terminal CANCELLED status', async () => {
      vi.spyOn(mockRepo, 'findPurchaseOrderById').mockResolvedValue({
        ...mockPo,
        status: PurchaseOrderStatus.CANCELLED,
      });

      await expect(
        service.updateStatus('po-1', PurchaseOrderStatus.ORDERED),
      ).rejects.toThrow(AppError);
    });

    it('should reject transitions from terminal RECEIVED status', async () => {
      vi.spyOn(mockRepo, 'findPurchaseOrderById').mockResolvedValue({
        ...mockPo,
        status: PurchaseOrderStatus.RECEIVED,
      });

      await expect(
        service.updateStatus('po-1', PurchaseOrderStatus.CANCELLED),
      ).rejects.toThrow(AppError);
    });
  });

  describe('PO Receiving & Over-Receive Blocking', () => {
    beforeEach(() => {
      // Set PO to ORDERED for receiving tests
      testPo.status = PurchaseOrderStatus.ORDERED;
      vi.spyOn(mockRepo, 'findPurchaseOrderById').mockImplementation(async () => ({
        ...testPo,
        status: PurchaseOrderStatus.ORDERED,
        items: [{ ...testPo.items![0] }],
      }));
    });

    it('should block over-receiving when incoming quantity exceeds ordered quantity', async () => {
      await expect(
        service.receivePoItems('po-1', {
          items: [{ variantId: 'var-1', quantity: 15 }], // Ordered 10, receiving 15
        }),
      ).rejects.toThrow(/Cannot receive 15 units.*Over-receiving is blocked/);

      expect(mockInvService.receiveStock).not.toHaveBeenCalled();
    });

    it('should reject receiving on PO in DRAFT status', async () => {
      vi.spyOn(mockRepo, 'findPurchaseOrderById').mockResolvedValue({
        ...mockPo,
        status: PurchaseOrderStatus.DRAFT,
      });

      await expect(
        service.receivePoItems('po-1', {
          items: [{ variantId: 'var-1', quantity: 5 }],
        }),
      ).rejects.toThrow(/Must be ORDERED or PARTIALLY_RECEIVED/);
    });

    it('should handle partial receive: set status PARTIALLY_RECEIVED, update inventory, and recompute costPrice', async () => {
      const result = await service.receivePoItems(
        'po-1',
        {
          items: [{ variantId: 'var-1', quantity: 4 }],
          notes: 'First partial batch',
        },
        { userId: 'admin-1' },
      );

      // Inventory receive called with reference PURCHASE_ORDER
      expect(mockInvService.receiveStock).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: 4,
          referenceType: 'PURCHASE_ORDER',
          referenceId: 'PO-20261101-ABCD',
        }),
        expect.anything(),
      );

      // Cost price updated in DB
      expect(prisma.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'var-1' },
          data: expect.objectContaining({ costPrice: expect.any(Number) }),
        }),
      );

      // Status transitioned to PARTIALLY_RECEIVED
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        'po-1',
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
        expect.anything(),
        expect.anything(),
      );
      expect(result.status).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    });

    it('should handle full receive: set status RECEIVED with receivedAt timestamp', async () => {
      const result = await service.receivePoItems(
        'po-1',
        {
          items: [{ variantId: 'var-1', quantity: 10 }], // Exactly ordered quantity
        },
        { userId: 'admin-1' },
      );

      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        'po-1',
        PurchaseOrderStatus.RECEIVED,
        expect.objectContaining({ receivedAt: expect.any(Date) }),
        expect.anything(),
      );
      expect(result.status).toBe(PurchaseOrderStatus.RECEIVED);
    });
  });
});
