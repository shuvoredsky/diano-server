import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@/config/database';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { purchaseOrdersService } from '@/modules/purchase-orders/purchase-orders.service';
import { stockAuditService } from '@/modules/inventory/stock-audit.service';
import { PurchaseOrderStatus } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const isTestDbAvailable = Boolean(
  process.env.TEST_DATABASE_URL &&
    process.env.DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL,
);

if (
  process.env.TEST_DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
) {
  throw new Error(
    'CRITICAL SAFETY REFUSAL: TEST_DATABASE_URL is identical to DATABASE_URL! Production/Main database could be wiped.',
  );
}

describe.skipIf(!isTestDbAvailable)(
  'Inventory Concurrency & Rollback Integration Tests (Real Neon PostgreSQL)',
  () => {
    let testWarehouseId: string;
    let testSupplierId: string;
    let testVariant1Id: string;
    let testVariant2Id: string;
    let testUserId: string;

    beforeAll(async () => {
      const runId = Date.now();

      // 1. Setup temporary warehouse
      const wh = await prisma.warehouse.create({
        data: {
          code: `WH-CONC-${runId}`,
          name: `Concurrency Warehouse ${runId}`,
          address: 'Integration Test Facility',
          isActive: true,
        },
      });
      testWarehouseId = wh.id;

      // 2. Setup temporary supplier
      const sup = await prisma.supplier.create({
        data: {
          name: `Supplier ${runId}`,
          code: `SUP-CONC-${runId}`,
          phone: '01700000000',
          isActive: true,
        },
      });
      testSupplierId = sup.id;

      // 3. Setup category & product
      const cat = await prisma.category.create({
        data: {
          name: `Category ${runId}`,
          slug: `cat-conc-${runId}`,
        },
      });

      const prod = await prisma.product.create({
        data: {
          name: `Concurrency Product ${runId}`,
          slug: `prod-conc-${runId}`,
          description: 'Concurrency test product description',
          categoryId: cat.id,
          mrp: 1200,
        },
      });

      // 4. Setup two test variants
      const var1 = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          sku: `SKU-C1-${runId}`,
          name: 'Variant One',
          price: 1000,
          compareAtPrice: 1200,
          costPrice: 500,
        },
      });
      testVariant1Id = var1.id;

      const var2 = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          sku: `SKU-C2-${runId}`,
          name: 'Variant Two',
          price: 1100,
          compareAtPrice: 1300,
          costPrice: 600,
        },
      });
      testVariant2Id = var2.id;

      // 5. Find or create an admin user for audit/actor context
      const user = await prisma.user.findFirst();
      testUserId = user?.id || 'admin-test-user';
    }, 45000);

    afterAll(async () => {
      await prisma.$disconnect();
    }, 30000);

    it('Scenario 1: Two concurrent receive calls for same PO -> total received never exceeds ordered, stock increases exactly once', async () => {
      const runId = Date.now();
      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber: `PO-CONC-1-${runId}`,
          supplierId: testSupplierId,
          warehouseId: testWarehouseId,
          status: PurchaseOrderStatus.ORDERED,
          totalAmount: 1000,
          items: {
            create: [
              {
                variantId: testVariant1Id,
                orderedQuantity: 10,
                receivedQuantity: 0,
                unitCost: 100,
                lineTotal: 1000,
              },
            ],
          },
        },
      });

      // Check baseline stock
      const baselineInv = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariant1Id,
            warehouseId: testWarehouseId,
          },
        },
      });
      const initialOnHand = baselineInv?.onHand ?? 0;

      // Execute two concurrent receive calls of full 10 units
      const [res1, res2] = await Promise.allSettled([
        purchaseOrdersService.receivePoItems(
          po.id,
          { items: [{ variantId: testVariant1Id, quantity: 10 }] },
          { userId: testUserId },
        ),
        purchaseOrdersService.receivePoItems(
          po.id,
          { items: [{ variantId: testVariant1Id, quantity: 10 }] },
          { userId: testUserId },
        ),
      ]);

      const successCount = [res1, res2].filter(r => r.status === 'fulfilled').length;
      const rejectedCount = [res1, res2].filter(r => r.status === 'rejected').length;

      expect(successCount).toBe(1);
      expect(rejectedCount).toBe(1);

      // Verify rejected one failed with AppError (blocked over-receive or wrong status)
      const rejected = (res1.status === 'rejected' ? res1 : res2) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(AppError);

      // Verify DB state: PO must be RECEIVED with receivedQuantity = 10
      const finalPo = await prisma.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { items: true },
      });
      expect(finalPo?.status).toBe(PurchaseOrderStatus.RECEIVED);
      expect(finalPo?.items[0].receivedQuantity).toBe(10);

      // Verify stock increased by exactly 10
      const finalInv = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariant1Id,
            warehouseId: testWarehouseId,
          },
        },
      });
      expect(finalInv?.onHand).toBe(initialOnHand + 10);
    });

    it('Scenario 2: Mid-way failure rolls back all lines (if line 2 throws, line 1 stock and ledger are rolled back)', async () => {
      const runId = Date.now();
      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber: `PO-CONC-2-${runId}`,
          supplierId: testSupplierId,
          warehouseId: testWarehouseId,
          status: PurchaseOrderStatus.ORDERED,
          totalAmount: 1100,
          items: {
            create: [
              {
                variantId: testVariant1Id,
                orderedQuantity: 5,
                receivedQuantity: 0,
                unitCost: 100,
                lineTotal: 500,
              },
              {
                variantId: testVariant2Id,
                orderedQuantity: 5,
                receivedQuantity: 0,
                unitCost: 120,
                lineTotal: 600,
              },
            ],
          },
        },
      });

      const invBefore1 = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariant1Id,
            warehouseId: testWarehouseId,
          },
        },
      });
      const onHandBefore1 = invBefore1?.onHand ?? 0;

      // Count ledger entries prior to test
      const movementsBefore = await prisma.stockMovement.count({
        where: { referenceId: po.poNumber },
      });
      expect(movementsBefore).toBe(0);

      // Force line 2 to throw by spying on invService.receiveStock when variant is testVariant2Id
      const originalReceiveStock = inventoryService.receiveStock.bind(inventoryService);
      const receiveStockSpy = vi
        .spyOn(inventoryService, 'receiveStock')
        .mockImplementation(async (input, tx) => {
          if (input.variantId === testVariant2Id) {
            throw new Error('SIMULATED_FAILURE_ON_LINE_2');
          }
          return originalReceiveStock(input, tx);
        });

      try {
        await expect(
          purchaseOrdersService.receivePoItems(
            po.id,
            {
              items: [
                { variantId: testVariant1Id, quantity: 5 },
                { variantId: testVariant2Id, quantity: 5 },
              ],
            },
            { userId: testUserId },
          ),
        ).rejects.toThrow('SIMULATED_FAILURE_ON_LINE_2');
      } finally {
        receiveStockSpy.mockRestore();
      }

      // Assert rollback: Line 1 stock must NOT have changed
      const invAfter1 = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariant1Id,
            warehouseId: testWarehouseId,
          },
        },
      });
      expect(invAfter1?.onHand ?? 0).toBe(onHandBefore1);

      // Assert rollback: Ledger movements must be 0
      const movementsAfter = await prisma.stockMovement.count({
        where: { referenceId: po.poNumber },
      });
      expect(movementsAfter).toBe(0);

      // Assert rollback: PO status must still be ORDERED with 0 received on all items
      const poAfter = await prisma.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { items: true },
      });
      expect(poAfter?.status).toBe(PurchaseOrderStatus.ORDERED);
      expect(poAfter?.items[0].receivedQuantity).toBe(0);
      expect(poAfter?.items[1].receivedQuantity).toBe(0);
    });

    it('Scenario 3: Partial receive (5 units) then second partial receive (5 units) works and marks PO RECEIVED', async () => {
      const runId = Date.now();
      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber: `PO-CONC-3-${runId}`,
          supplierId: testSupplierId,
          warehouseId: testWarehouseId,
          status: PurchaseOrderStatus.ORDERED,
          totalAmount: 1000,
          items: {
            create: [
              {
                variantId: testVariant1Id,
                orderedQuantity: 10,
                receivedQuantity: 0,
                unitCost: 100,
                lineTotal: 1000,
              },
            ],
          },
        },
      });

      // 1st partial receive: 5 units
      const partialPo1 = await purchaseOrdersService.receivePoItems(
        po.id,
        { items: [{ variantId: testVariant1Id, quantity: 5 }] },
        { userId: testUserId },
      );
      expect(partialPo1.status).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
      expect(partialPo1.receivedAt).toBeNull();

      // 2nd partial receive: remaining 5 units
      const partialPo2 = await purchaseOrdersService.receivePoItems(
        po.id,
        { items: [{ variantId: testVariant1Id, quantity: 5 }] },
        { userId: testUserId },
      );
      expect(partialPo2.status).toBe(PurchaseOrderStatus.RECEIVED);
      expect(partialPo2.receivedAt).toBeInstanceOf(Date);

      // Check final state in DB
      const dbPo = await prisma.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { items: true },
      });
      expect(dbPo?.status).toBe(PurchaseOrderStatus.RECEIVED);
      expect(dbPo?.items[0].receivedQuantity).toBe(10);
    });

    it('Scenario 4: Receive on RECEIVED or CANCELLED PO is rejected with 400', async () => {
      const runId = Date.now();

      // 4a. Already RECEIVED PO
      const receivedPo = await prisma.purchaseOrder.create({
        data: {
          poNumber: `PO-CONC-4A-${runId}`,
          supplierId: testSupplierId,
          warehouseId: testWarehouseId,
          status: PurchaseOrderStatus.RECEIVED,
          totalAmount: 500,
          items: {
            create: [
              {
                variantId: testVariant1Id,
                orderedQuantity: 5,
                receivedQuantity: 5,
                unitCost: 100,
                lineTotal: 500,
              },
            ],
          },
        },
      });

      await expect(
        purchaseOrdersService.receivePoItems(
          receivedPo.id,
          { items: [{ variantId: testVariant1Id, quantity: 1 }] },
          { userId: testUserId },
        ),
      ).rejects.toThrow(/Cannot receive goods against purchase order in status 'RECEIVED'/);

      // 4b. CANCELLED PO
      const cancelledPo = await prisma.purchaseOrder.create({
        data: {
          poNumber: `PO-CONC-4B-${runId}`,
          supplierId: testSupplierId,
          warehouseId: testWarehouseId,
          status: PurchaseOrderStatus.CANCELLED,
          totalAmount: 500,
          items: {
            create: [
              {
                variantId: testVariant1Id,
                orderedQuantity: 5,
                receivedQuantity: 0,
                unitCost: 100,
                lineTotal: 500,
              },
            ],
          },
        },
      });

      await expect(
        purchaseOrdersService.receivePoItems(
          cancelledPo.id,
          { items: [{ variantId: testVariant1Id, quantity: 1 }] },
          { userId: testUserId },
        ),
      ).rejects.toThrow(/Cannot receive goods against purchase order in status 'CANCELLED'/);
    });

    it('Scenario 5: Two concurrent audit approves -> exactly one succeeds, other fails (400), ledger has one set of adjustments', async () => {
      const runId = Date.now();

      // Setup initial stock for variant 2
      await inventoryService.receiveStock({
        variantId: testVariant2Id,
        warehouseId: testWarehouseId,
        quantity: 20,
        referenceType: 'MANUAL',
        referenceId: `INIT-AUDIT-${runId}`,
        reason: 'Initial stock for audit test',
      });

      // Create StockAudit with 1 item having a variance of -3 (missing 3 units)
      const audit = await prisma.stockAudit.create({
        data: {
          warehouseId: testWarehouseId,
          auditorId: testUserId,
          status: 'IN_PROGRESS',
          notes: `Audit Concurrency Test ${runId}`,
          items: {
            create: [
              {
                variantId: testVariant2Id,
                systemQuantity: 20,
                countedQuantity: 17,
                variance: -3,
                notes: 'Damaged in transit',
              },
            ],
          },
        },
      });

      const invBefore = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariant2Id,
            warehouseId: testWarehouseId,
          },
        },
      });
      const onHandBefore = invBefore?.onHand ?? 0;

      // Dispatch two concurrent approveAudit calls
      const [res1, res2] = await Promise.allSettled([
        stockAuditService.approveAudit(audit.id, testUserId),
        stockAuditService.approveAudit(audit.id, testUserId),
      ]);

      const successCount = [res1, res2].filter(r => r.status === 'fulfilled').length;
      const rejectedCount = [res1, res2].filter(r => r.status === 'rejected').length;

      expect(successCount).toBe(1);
      expect(rejectedCount).toBe(1);

      // Verify rejected call failed cleanly with 400 Bad Request
      const rejected = (res1.status === 'rejected' ? res1 : res2) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(AppError);
      expect(rejected.reason.message).toContain("Cannot approve an audit in status 'APPROVED'");

      // Verify DB audit status is APPROVED
      const finalAudit = await prisma.stockAudit.findUnique({
        where: { id: audit.id },
      });
      expect(finalAudit?.status).toBe('APPROVED');

      // Verify stock was adjusted by -3 exactly ONCE
      const invAfter = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariant2Id,
            warehouseId: testWarehouseId,
          },
        },
      });
      expect(invAfter?.onHand).toBe(onHandBefore - 3);

      // Verify ledger has exactly ONE AUDIT_ADJUSTMENT movement for this audit
      const movements = await prisma.stockMovement.findMany({
        where: {
          reason: { contains: audit.id },
        },
      });
      expect(movements.length).toBe(1);
      expect(movements[0].quantity).toBe(-3);
    });
  },
);
