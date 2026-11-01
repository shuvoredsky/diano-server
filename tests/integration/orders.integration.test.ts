import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { createTestSuperAdminAuth } from './test-auth-helper';
import { ordersService } from '@/modules/orders/orders.service';
import { invoiceService } from '@/modules/orders/invoice.service';
import { productsRepository } from '@/modules/products/products.repository';
import { productsService } from '@/modules/products/products.service';
import { siteSettingsService } from '@/modules/site-settings/site-settings.service';
import type { CheckoutCartSnapshot } from '@/modules/checkout/checkout.types';

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
  'Orders & Invoice Integration Tests (Real Neon DB)',
  () => {
    let authHeader: string;
    let testAdminUserId: string;
    let testSessionId: string;
    let defaultWarehouseId: string;

    const createdOrderIds: string[] = [];
    const createdSessionIds: string[] = [];
    const createdVariantIds: string[] = [];
    const createdProductIds: string[] = [];
    const createdCategoryIds: string[] = [];
    const createdUserIds: string[] = [];

    beforeAll(async () => {
      const auth = await createTestSuperAdminAuth();
      authHeader = `Bearer ${auth.token}`;
      testAdminUserId = auth.userId;
      testSessionId = auth.sessionId;
      createdUserIds.push(testAdminUserId);

      // Ensure default warehouse exists
      const wh = await prisma.warehouse.upsert({
        where: { code: 'WH-DHK-01' },
        update: { isActive: true, isDefault: true },
        create: {
          name: 'Central Warehouse Dhaka',
          code: 'WH-DHK-01',
          address: 'Tejgaon, Dhaka',
          isDefault: true,
          isActive: true,
        },
      });
      defaultWarehouseId = wh.id;
    });

    afterAll(async () => {
      // Targeted batch cleanups only — NEVER delete from StockMovement
      if (createdOrderIds.length > 0) {
        await prisma.orderInvoiceSnapshot.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.orderNote.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }

      if (createdSessionIds.length > 0) {
        await prisma.checkoutEvent.deleteMany({ where: { checkoutSessionId: { in: createdSessionIds } } }).catch(() => {});
        await prisma.checkoutSession.deleteMany({ where: { id: { in: createdSessionIds } } }).catch(() => {});
      }

      if (createdVariantIds.length > 0) {
        await prisma.productVariant.updateMany({
          where: { id: { in: createdVariantIds } },
          data: { deletedAt: new Date() },
        }).catch(() => {});
      }

      if (createdProductIds.length > 0) {
        await prisma.product.updateMany({
          where: { id: { in: createdProductIds } },
          data: { deletedAt: new Date() },
        }).catch(() => {});
      }

      if (testSessionId) {
        await prisma.session.deleteMany({ where: { id: testSessionId } }).catch(() => {});
      }

      if (createdUserIds.length > 0) {
        await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
      }

      await prisma.$disconnect();
    }, 60000);

    // Helper: Create product with variant and seed inventory
    async function setupTestProduct(initialOnHand = 10): Promise<{ productId: string; variantId: string }> {
      const cat = await prisma.category.create({
        data: {
          name: `Test Cat ${Date.now()}_${Math.random()}`,
          slug: `test-cat-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        },
      });
      createdCategoryIds.push(cat.id);

      const prod = await prisma.product.create({
        data: {
          name: `Test Product ${Date.now()}`,
          slug: `test-prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          categoryId: cat.id,
          description: 'Integration test product description',
          inventoryType: 'READY_STOCK',
        },
      });
      createdProductIds.push(prod.id);

      const variant = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          sku: `SKU-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          name: 'Regular Size',
          price: 1200.0,
          costPrice: 700.0,
        },
      });
      createdVariantIds.push(variant.id);

      // Seed physical stock in default warehouse
      await prisma.inventory.create({
        data: {
          variantId: variant.id,
          warehouseId: defaultWarehouseId,
          onHand: initialOnHand,
          reserved: 0,
          damaged: 0,
        },
      });

      return { productId: prod.id, variantId: variant.id };
    }

    // Helper: Create active checkout session
    async function setupTestCheckoutSession(variantId: string, quantity = 1): Promise<string> {
      const sessionId = `test_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const cartSnapshot: CheckoutCartSnapshot = {
        cartId: `cart_${Date.now()}`,
        items: [
          {
            variantId,
            name: 'Regular Size',
            sku: 'SKU-TEST',
            price: '1200.00',
            quantity,
            lineTotal: (1200 * quantity).toFixed(2),
            thumbnailUrl: null,
          },
        ],
        customerInfo: {
          name: 'Sabbir Rahman',
          phone: '01711223344',
          email: 'sabbir@example.com',
        },
        shippingAddress: {
          address: 'House 5, Road 2',
          district: 'Dhaka',
          area: 'Dhanmondi',
        },
        deliveryMethod: {
          code: 'STD-DHK',
          name: 'Standard Dhaka Delivery',
        },
        paymentMethod: {
          provider: 'COD',
        },
        shippingCharge: '60.00',
        discount: '0.00',
        tax: '0.00',
        grandTotal: (1200 * quantity + 60).toFixed(2),
      };

      const session = await prisma.checkoutSession.create({
        data: {
          sessionId,
          status: 'ACTIVE',
          cartSnapshot: cartSnapshot as unknown as any,
          checkoutValue: 1200 * quantity + 60,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      createdSessionIds.push(session.id);
      return session.id;
    }

    // ============================================================================
    // TEST 1: Same Idempotency-Key double submit/parallel => exactly 1 order, 1 reservation set
    // ============================================================================
    it('1. Same Idempotency-Key double submit/parallel => exactly 1 order, exactly 1 reservation set', async () => {
      const { variantId } = await setupTestProduct(10);
      const sessionId = await setupTestCheckoutSession(variantId, 2);
      const idempotencyKey = `idem-key-${Date.now()}-${Math.random()}`;

      // 1. Initial order placement submit
      const res1 = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({ checkoutSessionId: sessionId });

      // 2. Duplicate retry/resubmit with identical Idempotency-Key and payload
      const res2 = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({ checkoutSessionId: sessionId });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(200);

      const order1 = res1.body.data;
      const order2 = res2.body.data;

      expect(order1.orderNumber).toBe(order2.orderNumber);
      createdOrderIds.push(order1.id);

      // Verify DB level: exactly 1 order row exists
      const orderCount = await prisma.order.count({
        where: { idempotencyKey },
      });
      expect(orderCount).toBe(1);

      // Verify DB level: exactly 1 reservation stock movement set
      const movements = await prisma.stockMovement.findMany({
        where: { referenceId: idempotencyKey, action: 'RESERVE' },
      });
      expect(movements.length).toBe(1);
      expect(movements[0]?.quantity).toBe(2);
    });

    // ============================================================================
    // TEST 2: Last unit stock, 2 concurrent different orders => exactly 1 succeeds
    // ============================================================================
    it('2. Last unit stock, 2 concurrent different orders => exactly 1 succeeds, 1 rejected', async () => {
      // Exactly 1 unit available
      const { variantId } = await setupTestProduct(1);
      const sessionA = await setupTestCheckoutSession(variantId, 1);
      const sessionB = await setupTestCheckoutSession(variantId, 1);

      const keyA = `race-a-${Date.now()}`;
      const keyB = `race-b-${Date.now()}`;

      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/v1/orders')
          .set('Idempotency-Key', keyA)
          .send({ checkoutSessionId: sessionA }),
        request(app)
          .post('/api/v1/orders')
          .set('Idempotency-Key', keyB)
          .send({ checkoutSessionId: sessionB }),
      ]);

      const statuses = [resA.status, resB.status];
      // Exactly one 201 and one 400
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);

      const successfulOrder = resA.status === 201 ? resA.body.data : resB.body.data;
      createdOrderIds.push(successfulOrder.id);

      // Inventory check: reserved should be exactly 1, available 0
      const inv = await prisma.inventory.findUniqueOrThrow({
        where: {
          variantId_warehouseId: {
            variantId,
            warehouseId: defaultWarehouseId,
          },
        },
      });
      expect(inv.onHand).toBe(1);
      expect(inv.reserved).toBe(1);
    });

    // ============================================================================
    // TEST 3: Mid-transaction failure => no order, no stock change (rollback)
    // ============================================================================
    it('3. Mid-transaction failure => no order, no stock change (full transaction rollback)', async () => {
      const { productId, variantId } = await setupTestProduct(5);
      const sessionId = await setupTestCheckoutSession(variantId, 1);
      const idempotencyKey = `rollback-key-${Date.now()}`;

      // Simulate mid-transaction failure: soft-delete product so validation fails during transaction
      await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({ checkoutSessionId: sessionId });

      expect(res.status).toBe(400);

      // Verify no order created
      const orderCount = await prisma.order.count({
        where: { idempotencyKey },
      });
      expect(orderCount).toBe(0);

      // Verify no orphaned reservation movement
      const movements = await prisma.stockMovement.findMany({
        where: { referenceId: idempotencyKey },
      });
      expect(movements.length).toBe(0);
    });

    // ============================================================================
    // TEST 4: Cancel => reserved back, ledger consistent (movements sum == inventory change)
    // ============================================================================
    it('4. Cancel => reserved stock restored, double-entry ledger strictly consistent', async () => {
      const { variantId } = await setupTestProduct(10);
      const sessionId = await setupTestCheckoutSession(variantId, 3);
      const idempotencyKey = `cancel-test-${Date.now()}`;

      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({ checkoutSessionId: sessionId });

      expect(createRes.status).toBe(201);
      const order = createRes.body.data;
      createdOrderIds.push(order.id);

      // Reserved is now 3
      let inv = await prisma.inventory.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId, warehouseId: defaultWarehouseId } },
      });
      expect(inv.reserved).toBe(3);

      // Cancel the order via ordersService as the customer
      const cancelled = await ordersService.cancelOrderByCustomer(
        order.id,
        order.customerId,
        'Customer changed their mind',
      );
      expect(cancelled.status).toBe('CANCELLED');

      // Verify stock reservation released back to 0
      inv = await prisma.inventory.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId, warehouseId: defaultWarehouseId } },
      });
      expect(inv.reserved).toBe(0);
      expect(inv.onHand).toBe(10);

      // Ledger consistency: RESERVE (+3) + RELEASE (-3) = net 0 change to available stock
      const reserveMovements = await prisma.stockMovement.findMany({
        where: { referenceId: idempotencyKey, action: 'RESERVE' },
      });
      const releaseMovements = await prisma.stockMovement.findMany({
        where: { referenceId: order.orderNumber, action: 'RELEASE' },
      });

      expect(reserveMovements.length).toBe(1);
      expect(releaseMovements.length).toBe(1);
      expect(reserveMovements[0]?.quantity).toBe(3);
      expect(releaseMovements[0]?.quantity).toBe(3);
    });

    // ============================================================================
    // TEST 5: Invalid transition rejected, history rows correct
    // ============================================================================
    it('5. Invalid transition rejected with 409 Conflict, history rows intact', async () => {
      const { variantId } = await setupTestProduct(5);
      const sessionId = await setupTestCheckoutSession(variantId, 1);
      const idempotencyKey = `history-test-${Date.now()}`;

      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({ checkoutSessionId: sessionId });

      const order = createRes.body.data;
      createdOrderIds.push(order.id);

      // Attempt invalid transition PENDING -> DELIVERED via Admin PATCH
      const patchRes = await request(app)
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('Authorization', authHeader)
        .send({ status: 'DELIVERED', note: 'Attempting invalid jump' });

      expect(patchRes.status).toBe(409);
      expect(patchRes.body.message).toContain("Invalid order status transition from 'PENDING' to 'DELIVERED'");

      // Verify history rows in database: exactly 1 row (PENDING)
      const historyRows = await prisma.orderStatusHistory.findMany({
        where: { orderId: order.id },
      });
      expect(historyRows.length).toBe(1);
      expect(historyRows[0]?.status).toBe('PENDING');
    });

    // ============================================================================
    // TEST 6: Session cannot convert twice
    // ============================================================================
    it('6. Checkout session cannot be converted twice', async () => {
      const { variantId } = await setupTestProduct(5);
      const sessionId = await setupTestCheckoutSession(variantId, 1);
      const key1 = `convert-1-${Date.now()}`;
      const key2 = `convert-2-${Date.now()}`;

      // First conversion
      const res1 = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', key1)
        .send({ checkoutSessionId: sessionId });

      expect(res1.status).toBe(201);
      createdOrderIds.push(res1.body.data.id);

      // Second conversion attempt with new idempotency key
      const res2 = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', key2)
        .send({ checkoutSessionId: sessionId });

      expect(res2.status).toBe(409);
      expect(res2.body.message).toContain('Checkout session has already been converted to an order');
    });

    // ============================================================================
    // TEST 7: Invoice PDF generate (starts %PDF), snapshot unchanged after settings change
    // ============================================================================
    it('7. Invoice PDF generates (%PDF) and frozen snapshot remains unchanged after settings modification', async () => {
      const { variantId } = await setupTestProduct(5);
      const sessionId = await setupTestCheckoutSession(variantId, 1);
      const idempotencyKey = `inv-freeze-${Date.now()}`;

      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({ checkoutSessionId: sessionId });

      const order = createRes.body.data;
      createdOrderIds.push(order.id);

      // 1. Generate invoice
      const invoiceRes = await request(app)
        .get(`/api/v1/admin/orders/${order.id}/invoice`)
        .set('Authorization', authHeader)
        .responseType('blob');

      expect(invoiceRes.status).toBe(200);
      expect(invoiceRes.headers['content-type']).toContain('application/pdf');
      const pdfBuf = Buffer.isBuffer(invoiceRes.body) ? invoiceRes.body : Buffer.from(invoiceRes.body);
      expect(pdfBuf.subarray(0, 4).toString('ascii')).toBe('%PDF');

      // 2. Fetch the frozen snapshot from database
      const initialSnapshot = await prisma.orderInvoiceSnapshot.findUniqueOrThrow({
        where: { orderId: order.id },
      });
      const originalStoreName = (initialSnapshot.storeProfile as any).storeName;

      // 3. Mutate the active store settings in DB
      await siteSettingsService.updateSettingGroup(
        'store_profile',
        {
          storeName: 'Modified Brand Name 2027',
          tagline: 'Changed Tagline',
          phone: '+8801999999999',
          email: 'new@brand.com',
          address: 'New Location',
        },
        { userId: testAdminUserId, email: 'admin@diano.com' },
      );

      // 4. Re-fetch invoice snapshot for that order
      const snapshotAfterChange = await invoiceService.getOrCreateInvoiceSnapshot(order.id);
      expect(snapshotAfterChange.storeProfile.storeName).toBe(originalStoreName);
      expect(snapshotAfterChange.storeProfile.storeName).not.toBe('Modified Brand Name 2027');
    });

    // ============================================================================
    // TEST 8: hasStockOrOrders real order check blocks variant deletion
    // ============================================================================
    it('8. hasStockOrOrders uses real orderItem check and blocks deletion of variant with orders', async () => {
      const { variantId } = await setupTestProduct(5);
      const sessionId = await setupTestCheckoutSession(variantId, 1);
      const idempotencyKey = `del-block-${Date.now()}`;

      // Place order referencing this variant
      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({ checkoutSessionId: sessionId });

      expect(createRes.status).toBe(201);
      createdOrderIds.push(createRes.body.data.id);

      // Verify hasStockOrOrders returns true
      const hasOrders = await productsRepository.hasStockOrOrders(variantId);
      expect(hasOrders).toBe(true);

      // Delete variant should be blocked
      await expect(productsService.deleteVariant(variantId)).rejects.toThrow(
        'Cannot delete variant with existing stock or historical order records',
      );
    });
  },
);
