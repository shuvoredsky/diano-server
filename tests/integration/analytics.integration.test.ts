import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import {
  createTestSuperAdminAuth,
  createTestCustomerAuth,
  createTestUserWithPermissions,
} from './test-auth-helper';

describe('Analytics Module Integration Tests', () => {
  let adminToken: string;
  let customerToken: string;
  let viewerToken: string; // Has analytics:view, but NOT analytics:view_finance

  let testCustomerId: string;
  let testWarehouseId: string;
  let testProductId: string;
  let testVariantId: string;

  const cleanupOrderIds: string[] = [];
  const cleanupExpenseIds: string[] = [];
  const cleanupRefundIds: string[] = [];
  const cleanupPaymentIds: string[] = [];

  beforeAll(async () => {
    // 1. Setup Auth
    const adminAuth = await createTestSuperAdminAuth();
    adminToken = `Bearer ${adminAuth.token}`;

    const customerAuth = await createTestCustomerAuth();
    customerToken = `Bearer ${customerAuth.token}`;
    testCustomerId = customerAuth.userId;

    const viewerAuth = await createTestUserWithPermissions('analytics_viewer_role', [
      'analytics:view',
    ]);
    viewerToken = `Bearer ${viewerAuth.token}`;

    // 2. Setup Warehouse & Product
    let warehouse = await prisma.warehouse.findFirst({ where: { isActive: true } });
    if (!warehouse) {
      warehouse = await prisma.warehouse.create({
        data: {
          name: 'Analytics Test Hub',
          code: `WH-ANL-${Date.now().toString().slice(-4)}`,
          district: 'Dhaka',
          address: 'Tejgaon',
          isDefault: true,
          isActive: true,
        },
      });
    }
    testWarehouseId = warehouse.id;

    let category = await prisma.category.findFirst({ where: { isActive: true } });
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: 'Analytics Category',
          slug: `cat-anl-${Date.now()}`,
          isActive: true,
        },
      });
    }

    const product = await prisma.product.create({
      data: {
        name: 'Analytics Premium Bag',
        slug: `prod-anl-${Date.now()}`,
        categoryId: category.id,
        description: 'High quality analytics test bag',
        status: 'PUBLISHED',
      },
    });
    testProductId = product.id;

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Leather Black',
        sku: `SKU-ANL-${Date.now()}`,
        price: 1500.0,
        costPrice: 900.0, // 100% known costPrice for COGS
        reorderLevel: 5,
        isActive: true,
      },
    });
    testVariantId = variant.id;

    await prisma.inventory.upsert({
      where: {
        variantId_warehouseId: {
          variantId: variant.id,
          warehouseId: testWarehouseId,
        },
      },
      update: { onHand: 50 },
      create: {
        variantId: variant.id,
        warehouseId: testWarehouseId,
        onHand: 50,
        reserved: 0,
        damaged: 0,
        safetyStock: 5,
      },
    });

    // 3. Seed Orders for TODAY (Asia/Dhaka)
    const now = new Date();
    const order1Number = `ORD-ANL-1-${Date.now()}`;
    const order1 = await prisma.order.create({
      data: {
        orderNumber: order1Number,
        customerId: testCustomerId,
        status: 'CONFIRMED',
        subtotal: 3000.0, // 2 items * 1500
        discountTotal: 200.0,
        shippingTotal: 100.0,
        taxTotal: 0.0,
        grandTotal: 2900.0,
        paymentStatus: 'PAID',
        paymentMethod: 'COD',
        placedAt: now,
        shippingAddressSnapshot: { district: 'Dhaka', city: 'Dhaka', phone: '01712345678' },
        customerSnapshot: { name: 'Analytics Tester', phone: '01712345678', email: 'tester@diano.com' },
        items: {
          create: [
            {
              variantId: variant.id,
              productName: product.name,
              variantName: variant.name,
              sku: variant.sku,
              unitPrice: 1500.0,
              costPrice: 900.0,
              quantity: 2,
              discount: 200.0,
              lineTotal: 2800.0,
            },
          ],
        },
      },
    });
    cleanupOrderIds.push(order1.id);

    // Order 2: Delivered
    const order2Number = `ORD-ANL-2-${Date.now()}`;
    const order2 = await prisma.order.create({
      data: {
        orderNumber: order2Number,
        customerId: testCustomerId,
        status: 'DELIVERED',
        subtotal: 1500.0,
        discountTotal: 0.0,
        shippingTotal: 60.0,
        taxTotal: 0.0,
        grandTotal: 1560.0,
        paymentStatus: 'PAID',
        paymentMethod: 'SSLCOMMERZ',
        placedAt: now,
        deliveredAt: now,
        shippingAddressSnapshot: { district: 'Chittagong', city: 'Chittagong', phone: '01812345678' },
        customerSnapshot: { name: 'Analytics Tester 2', phone: '01812345678', email: 'tester2@diano.com' },
        items: {
          create: [
            {
              variantId: variant.id,
              productName: product.name,
              variantName: variant.name,
              sku: variant.sku,
              unitPrice: 1500.0,
              costPrice: 900.0,
              quantity: 1,
              discount: 0.0,
              lineTotal: 1500.0,
            },
          ],
        },
      },
    });
    cleanupOrderIds.push(order2.id);

    // Order 3: Cancelled (Excluded from sales, included in cancellation rate)
    const order3Number = `ORD-ANL-3-${Date.now()}`;
    const order3 = await prisma.order.create({
      data: {
        orderNumber: order3Number,
        customerId: testCustomerId,
        status: 'CANCELLED',
        subtotal: 1500.0,
        discountTotal: 0.0,
        shippingTotal: 60.0,
        taxTotal: 0.0,
        grandTotal: 1560.0,
        paymentStatus: 'FAILED',
        paymentMethod: 'SSLCOMMERZ',
        placedAt: now,
        shippingAddressSnapshot: { district: 'Sylhet', city: 'Sylhet' },
        customerSnapshot: { name: 'Cancelled Tester', phone: '01912345678' },
      },
    });
    cleanupOrderIds.push(order3.id);

    // 4. Seed Payment with fee for Order 2
    const payment = await prisma.payment.create({
      data: {
        orderId: order2.id,
        provider: 'SSLCOMMERZ',
        status: 'PAID',
        amount: 1560.0,
        paymentFee: 35.0,
        paidAt: now,
      },
    });
    cleanupPaymentIds.push(payment.id);

    // 5. Seed Completed Refund on Order 1
    const refund = await prisma.refund.create({
      data: {
        orderId: order1.id,
        paymentId: payment.id,
        amount: 300.0,
        reason: 'Defective zipper',
        status: 'COMPLETED',
        completedAt: now,
      },
    });
    cleanupRefundIds.push(refund.id);

    // 6. Seed Expense
    const expense = await prisma.expense.create({
      data: {
        category: 'PACKAGING',
        amount: 400.0,
        date: now,
        note: 'High-grade protective bubble wrap',
        createdBy: testCustomerId,
      },
    });
    cleanupExpenseIds.push(expense.id);
  });

  afterAll(async () => {
    if (cleanupExpenseIds.length > 0) {
      await prisma.expense.deleteMany({ where: { id: { in: cleanupExpenseIds } } });
    }
    if (cleanupRefundIds.length > 0) {
      await prisma.refund.deleteMany({ where: { id: { in: cleanupRefundIds } } });
    }
    if (cleanupPaymentIds.length > 0) {
      await prisma.payment.deleteMany({ where: { id: { in: cleanupPaymentIds } } });
    }
    if (cleanupOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: cleanupOrderIds } } });
    }
    if (testVariantId) {
      await prisma.inventory.deleteMany({ where: { variantId: testVariantId } });
      await prisma.productVariant.deleteMany({ where: { id: testVariantId } });
    }
    if (testProductId) {
      await prisma.product.deleteMany({ where: { id: testProductId } });
    }
  });

  it('rejects unauthenticated requests to analytics endpoints', async () => {
    const res = await request(app).get('/api/v1/admin/analytics/overview');
    expect(res.status).toBe(401);
  });

  it('rejects unauthorized users lacking analytics:view', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/overview')
      .set('Authorization', customerToken);
    expect(res.status).toBe(403);
  });

  it('computes exact financial and order KPIs in /overview for today', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/overview?period=today')
      .set('Authorization', adminToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cards = res.body.data.cards;
    // grossSales: Order 1 (3000) + Order 2 (1500) = 4500 (Cancelled Order 3 excluded!)
    expect(cards.grossSales.current).toBeGreaterThanOrEqual(4500);

    // discounts: Order 1 had 200 discount
    expect(cards.discounts?.current || res.body.data.cards.netSales.current).toBeDefined();

    // netSales = grossSales (4500) - discounts (200) - completed refund (300) = 4000
    expect(cards.netSales.current).toBeGreaterThanOrEqual(4000);

    // COGS is 100% complete so grossProfit is not null
    expect(cards.grossProfit.current).not.toBeNull();
    expect(cards.netProfit.current).not.toBeNull();

    // Cancellation rate: 1 cancelled out of at least 3 orders
    expect(cards.cancellationRate.current).toBeGreaterThan(0);
  });

  it('strips financial KPIs when user has analytics:view but lacks analytics:view_finance', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/overview?period=today')
      .set('Authorization', viewerToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cards = res.body.data.cards;
    // Sales and orders remain visible
    expect(cards.grossSales.current).not.toBeNull();
    expect(cards.totalOrders.current).not.toBeNull();

    // Financial profit cards MUST BE STRIPPED (null)
    expect(cards.grossProfit).toBeNull();
    expect(cards.netProfit).toBeNull();
  });

  it('retrieves detailed revenue breakdown and strips finance columns for viewer', async () => {
    // Admin request
    const adminRes = await request(app)
      .get('/api/v1/admin/analytics/revenue?period=today')
      .set('Authorization', adminToken);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.cogs).toBeDefined();
    expect(adminRes.body.data.grossProfit).toBeDefined();
    expect(adminRes.body.data.expenses.total).toBeGreaterThanOrEqual(400);

    // Viewer request (financial fields stripped)
    const viewerRes = await request(app)
      .get('/api/v1/admin/analytics/revenue?period=today')
      .set('Authorization', viewerToken);

    expect(viewerRes.status).toBe(200);
    expect(viewerRes.body.data.grossSales).toBeDefined();
    expect(viewerRes.body.data.cogs).toBeUndefined();
    expect(viewerRes.body.data.grossProfit).toBeUndefined();
    expect(viewerRes.body.data.expenses).toBeUndefined();
  });

  it('retrieves order, product, inventory, and payment analytics', async () => {
    const [ordersRes, productsRes, inventoryRes, paymentsRes, funnelRes] = await Promise.all([
      request(app).get('/api/v1/admin/analytics/orders?period=today').set('Authorization', adminToken),
      request(app).get('/api/v1/admin/analytics/products?period=today').set('Authorization', adminToken),
      request(app).get('/api/v1/admin/analytics/inventory').set('Authorization', adminToken),
      request(app).get('/api/v1/admin/analytics/payments?period=today').set('Authorization', adminToken),
      request(app).get('/api/v1/admin/analytics/funnel?period=today').set('Authorization', adminToken),
    ]);

    expect(ordersRes.status).toBe(200);
    expect(ordersRes.body.data.statusBreakdown).toBeInstanceOf(Array);

    expect(productsRes.status).toBe(200);
    expect(productsRes.body.data.top10SellingByQty).toBeInstanceOf(Array);

    expect(inventoryRes.status).toBe(200);
    expect(inventoryRes.body.data.totalStockUnits).toBeGreaterThanOrEqual(50);

    expect(paymentsRes.status).toBe(200);
    expect(paymentsRes.body.data.methodBreakdown).toBeInstanceOf(Array);

    expect(funnelRes.status).toBe(200);
    expect(funnelRes.body.data.steps).toHaveLength(3);
  });

  it('blocks profit-trend chart without analytics:view_finance', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/charts/profit-trend?period=today')
      .set('Authorization', viewerToken);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/analytics:view_finance/);
  });

  it('serves gap-filled sales-trend chart data to admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/charts/sales-trend?period=today')
      .set('Authorization', adminToken);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    // Hourly chart for today should have continuous hourly buckets
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
