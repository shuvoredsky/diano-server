import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/config/database';
import { inventoryService } from '@/modules/inventory/inventory.service';

const isTestDbAvailable = Boolean(
  process.env.TEST_DATABASE_URL &&
    process.env.DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL,
);

// Safety protection: Refuse if test DB equals primary DB
if (
  process.env.TEST_DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
) {
  throw new Error(
    'CRITICAL SAFETY REFUSAL: TEST_DATABASE_URL is identical to DATABASE_URL! Production/Main database could be wiped.',
  );
}

describe.skipIf(!isTestDbAvailable)(
  'Inventory & Stock Ledger Database Integration Tests (Requires Real PostgreSQL)',
  () => {
    let testWarehouseId: string;
    let testVariantId: string;

    beforeAll(async () => {
      // 1. Setup temporary warehouse
      const wh = await prisma.warehouse.create({
        data: {
          code: `WH-TEST-${Date.now()}`,
          name: 'Integration Test Warehouse',
          address: 'Tejgaon Industrial Area, Dhaka',
          isActive: true,
        },
      });
      testWarehouseId = wh.id;

      // 2. Setup category, product and variant
      const category = await prisma.category.create({
        data: {
          name: `Test Cat ${Date.now()}`,
          slug: `test-cat-${Date.now()}`,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'Integration Test T-Shirt',
          slug: `int-test-tshirt-${Date.now()}`,
          description: 'Integration test product description',
          categoryId: category.id,
          mrp: 1000,
        },
      });

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: `SKU-INT-${Date.now()}`,
          name: 'Black - L',
          price: 900,
          compareAtPrice: 1000,
          costPrice: 500,
          reorderLevel: 5,
        },
      });
      testVariantId = variant.id;

      // 3. Receive initial stock of exactly 5 units
      await inventoryService.receiveStock({
        variantId: testVariantId,
        warehouseId: testWarehouseId,
        quantity: 5,
        referenceType: 'MANUAL',
        referenceId: 'INIT-TEST-STOCK',
        reason: 'Integration test initial seed stock',
      });
    }, 30000);

    afterAll(async () => {
      // Disconnect cleanly (StockMovement is immutable ledger protected by DB trigger)
      await prisma.$disconnect();
    }, 30000);

    it('Scenario 1: Real concurrent reserve with Promise.all (Stock 5, 10 concurrent reserve of 1 => exactly 5 succeed, 5 fail)', async () => {
      const testRunId = Date.now();

      // Dispatch 10 concurrent reservation attempts of 1 unit each
      const attempts = Array.from({ length: 10 }).map((_, index) =>
        inventoryService
          .reserveStock({
            variantId: testVariantId,
            warehouseId: testWarehouseId,
            quantity: 1,
            referenceType: 'CHECKOUT',
            referenceId: `CONCURRENT-CHECKOUT-${testRunId}-${index}`,
          })
          .then(() => ({ success: true, index }))
          .catch(err => ({ success: false, error: err.message, index })),
      );

      const results = await Promise.all(attempts);

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      // Exactly 5 reservations must succeed and exactly 5 must fail with insufficient stock
      expect(successful).toHaveLength(5);
      expect(failed).toHaveLength(5);

      // Verify DB state: onHand=5, reserved=5, available=0
      const currentInv = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariantId,
            warehouseId: testWarehouseId,
          },
        },
      });

      expect(currentInv?.onHand).toBe(5);
      expect(currentInv?.reserved).toBe(5);
    });

    it('Scenario 2: Database CHECK constraint prevents negative stock and reserved > onHand', async () => {
      // Direct raw SQL attempt to violate check constraint: onHand - reserved - damaged < 0
      await expect(
        prisma.$executeRaw`
          UPDATE "Inventory"
          SET "reserved" = 100
          WHERE "variantId" = ${testVariantId} AND "warehouseId" = ${testWarehouseId}
        `,
      ).rejects.toThrow(/chk_inventory_available_stock_non_negative|check constraint/i);
    });

    it('Scenario 3: Append-Only Trigger blocks direct UPDATE or DELETE mutations on StockMovement ledger', async () => {
      // Find a recorded movement
      const movement = await prisma.stockMovement.findFirst({
        where: { variantId: testVariantId },
      });

      expect(movement).toBeDefined();

      // Direct SQL UPDATE must be rejected by trigger
      await expect(
        prisma.$executeRaw`
          UPDATE "StockMovement"
          SET "quantity" = 999
          WHERE "id" = ${movement!.id}
        `,
      ).rejects.toThrow(/append-only|trigger/i);

      // Direct SQL DELETE must be rejected by trigger
      await expect(
        prisma.$executeRaw`
          DELETE FROM "StockMovement"
          WHERE "id" = ${movement!.id}
        `,
      ).rejects.toThrow(/append-only|trigger/i);
    });

    it('Scenario 4: Transfer deadlock prevention with concurrent opposite-direction transfers (WH-A -> WH-B and WH-B -> WH-A)', async () => {
      // 1. Create a second warehouse
      const wh2 = await prisma.warehouse.create({
        data: {
          code: `WH-TEST2-${Date.now()}`,
          name: 'Integration Test Warehouse 2',
          address: 'Chittagong Port Area',
          isActive: true,
        },
      });

      // 2. Receive 10 units in Warehouse 1 and 10 units in Warehouse 2
      await inventoryService.receiveStock({
        variantId: testVariantId,
        warehouseId: testWarehouseId,
        quantity: 10,
        referenceType: 'MANUAL',
        referenceId: `DEADLOCK-INIT-1-${Date.now()}`,
        reason: 'Initial stock for deadlock test WH1',
      });

      await inventoryService.receiveStock({
        variantId: testVariantId,
        warehouseId: wh2.id,
        quantity: 10,
        referenceType: 'MANUAL',
        referenceId: `DEADLOCK-INIT-2-${Date.now()}`,
        reason: 'Initial stock for deadlock test WH2',
      });

      // 3. Concurrently trigger opposite-direction transfers
      // Transfer 1: WH1 -> WH2 (2 units)
      // Transfer 2: WH2 -> WH1 (3 units)
      const transfer1Promise = inventoryService.transferStock({
        variantId: testVariantId,
        sourceWarehouseId: testWarehouseId,
        targetWarehouseId: wh2.id,
        quantity: 2,
        reason: 'Transfer WH1 -> WH2 concurrent test',
        referenceType: 'TRANSFER',
        referenceId: `TRF-A-B-${Date.now()}`,
      });

      const transfer2Promise = inventoryService.transferStock({
        variantId: testVariantId,
        sourceWarehouseId: wh2.id,
        targetWarehouseId: testWarehouseId,
        quantity: 3,
        reason: 'Transfer WH2 -> WH1 concurrent test',
        referenceType: 'TRANSFER',
        referenceId: `TRF-B-A-${Date.now()}`,
      });

      // Both must resolve cleanly without PostgreSQL deadlock (Code 40P01)
      const [res1, res2] = await Promise.all([transfer1Promise, transfer2Promise]);

      expect(res1.sourceInventory).toBeDefined();
      expect(res2.sourceInventory).toBeDefined();

      // Verify final balances
      const inv1 = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariantId,
            warehouseId: testWarehouseId,
          },
        },
      });

      const inv2 = await prisma.inventory.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: testVariantId,
            warehouseId: wh2.id,
          },
        },
      });

      // Initial in WH1 was 5 (from beforeAll, reserved 5) + 10 received = 15.
      // Net change in WH1: -2 (outbound) + 3 (inbound) = +1 => 15 + 1 = 16.
      expect(inv1?.onHand).toBe(16);

      // Initial in WH2 was 10. Net change in WH2: +2 (inbound) - 3 (outbound) = -1 => 10 - 1 = 9.
      expect(inv2?.onHand).toBe(9);
    }, 30000);
  },
);
