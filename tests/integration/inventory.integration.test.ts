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
    });

    afterAll(async () => {
      // Cleanup created resources
      if (testVariantId) {
        await prisma.stockMovement.deleteMany({ where: { variantId: testVariantId } }).catch(() => {});
        await prisma.inventory.deleteMany({ where: { variantId: testVariantId } }).catch(() => {});
        await prisma.productVariant.deleteMany({ where: { id: testVariantId } }).catch(() => {});
      }
      if (testWarehouseId) {
        await prisma.warehouse.deleteMany({ where: { id: testWarehouseId } }).catch(() => {});
      }
      await prisma.$disconnect();
    });

    it('Scenario 1: Real concurrent reserve with Promise.all (Stock 5, 10 concurrent reserve of 1 => exactly 5 succeed, 5 fail)', async () => {
      // Dispatch 10 concurrent reservation attempts of 1 unit each
      const attempts = Array.from({ length: 10 }).map((_, index) =>
        inventoryService
          .reserveStock({
            variantId: testVariantId,
            warehouseId: testWarehouseId,
            quantity: 1,
            referenceType: 'CHECKOUT',
            referenceId: `CONCURRENT-CHECKOUT-${index}`,
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
  },
);
