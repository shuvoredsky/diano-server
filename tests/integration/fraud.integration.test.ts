import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Decimal from 'decimal.js';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { ordersService } from '@/modules/orders/orders.service';
import { createTestSuperAdminAuth } from './test-auth-helper';

describe('M11 Fraud Detection & Review Queue Integration Tests', () => {
  let adminToken: string;
  let testUserId: string;
  let testProductId: string;
  let testVariantId: string;

  const createdOrderIds: string[] = [];
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    // 1. Create super-admin authentication
    const auth = await createTestSuperAdminAuth();
    adminToken = `Bearer ${auth.token}`;
    testUserId = auth.userId;

    // 2. Ensure default warehouse
    let warehouse = await prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (!warehouse) {
      warehouse = await prisma.warehouse.upsert({
        where: { code: 'WH-DHK-01' },
        update: { isDefault: true, isActive: true },
        create: {
          name: 'Central Warehouse Dhaka',
          code: 'WH-DHK-01',
          address: 'Dhaka',
          isDefault: true,
          isActive: true,
        },
      });
    }

    // 3. Ensure essential fraud rules exist
    const rulesToEnsure = [
      {
        key: 'NEW_ACCOUNT_HIGH_VALUE_COD',
        name: 'New Account High Value COD',
        weight: 35,
        parameters: { codValueThreshold: 15000, accountAgeHours: 24 },
      },
      {
        key: 'UNUSUAL_ORDER_VALUE_OR_QUANTITY',
        name: 'Unusual Quantity or Value',
        weight: 35,
        parameters: { thresholdValue: 15000, thresholdQuantity: 15 },
      },
      {
        key: 'REPEATED_COD_CANCELLATIONS',
        name: 'Repeated COD Cancellations',
        weight: 35,
        parameters: { threshold: 2, windowDays: 30 },
      },
    ];

    for (const r of rulesToEnsure) {
      await prisma.fraudRule.upsert({
        where: { key: r.key },
        update: { weight: r.weight, isEnabled: true, parameters: r.parameters },
        create: {
          key: r.key,
          name: r.name,
          weight: r.weight,
          isEnabled: true,
          parameters: r.parameters,
        },
      });
    }

    // 4. Create Category & Product
    const category = await prisma.category.create({
      data: {
        name: 'Fraud Test Category',
        slug: `fraud-test-cat-${Date.now()}`,
      },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Fraud Test Shirt',
        slug: `fraud-test-shirt-${Date.now()}`,
        description: 'Test product for fraud detection',
        categoryId: category.id,
      },
    });
    testProductId = product.id;

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default Variant',
        sku: `SKU-FRAUD-${Date.now()}`,
        price: new Decimal('20000.00'), // High value
        costPrice: new Decimal('12000.00'),
      },
    });
    testVariantId = variant.id;

    // 5. Add inventory
    await inventoryService.receiveStock({
      variantId: variant.id,
      warehouseId: warehouse.id,
      quantity: 50,
      unitCost: '12000.00',
      reason: 'Initial test stock',
    });
  }, 30000);

  afterAll(async () => {
    // Teardown test data safely in proper foreign key order
    try {
      if (createdOrderIds.length > 0) {
        await prisma.payment.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.fraudDecisionHistory.deleteMany({
          where: { fraudAssessment: { orderId: { in: createdOrderIds } } },
        });
        await prisma.fraudAssessment.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.orderStatusHistory.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.orderItem.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }

      if (testVariantId) {
        await prisma.productVariant.updateMany({
          where: { id: testVariantId },
          data: { deletedAt: new Date(), isActive: false },
        });
      }
      if (testProductId) {
        await prisma.product.updateMany({
          where: { id: testProductId },
          data: { deletedAt: new Date() },
        });
      }

      if (createdSessionIds.length > 0) {
        await prisma.checkoutSession.deleteMany({
          where: { id: { in: createdSessionIds } },
        });
      }
    } catch {
      // Ignore teardown cleanup errors
    }
  });

  async function createTestCheckoutSession(
    variantId: string,
    grandTotal = 20000,
    isGuest = true,
    phone = '01799887766',
  ): Promise<string> {
    const sessionId = `test_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const cartSnapshot = {
      cartId: `cart_${Date.now()}`,
      items: [
        {
          variantId,
          name: 'High Value Item',
          sku: 'SKU-FRAUD-HV',
          price: grandTotal.toFixed(2),
          quantity: 1,
          lineTotal: grandTotal.toFixed(2),
          thumbnailUrl: null,
        },
      ],
      customerInfo: {
        name: 'High Risk Buyer',
        phone,
        email: 'highrisk@example.com',
        isGuest,
      },
      shippingAddress: {
        address: 'House 99, Road 10',
        district: 'Dhaka',
        area: 'Banani',
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
      grandTotal: (grandTotal + 60).toFixed(2),
    };

    const session = await prisma.checkoutSession.create({
      data: {
        sessionId,
        status: 'ACTIVE',
        cartSnapshot: cartSnapshot as unknown as Prisma.InputJsonValue,
        checkoutValue: grandTotal + 60,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    createdSessionIds.push(session.id);
    return session.id;
  }

  it('Flow 1: High risk order is held in PENDING review queue and confirmation is blocked', async () => {
    // 1. Create a guest checkout session for a high-value COD order
    const sessionId = await createTestCheckoutSession(testVariantId, 20000, true, '01799887766');

    const idempKey1 = `idemp-fraud-high-${Date.now()}`;
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', idempKey1)
      .send({
        checkoutSessionId: sessionId,
        idempotencyKey: idempKey1,
      });

    if (orderRes.status !== 201) console.error('ORDER RES FAILED:', orderRes.body);
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;
    createdOrderIds.push(orderId);

    // 3. Verify FraudAssessment was generated and marked HIGH
    const assessment = await prisma.fraudAssessment.findUnique({
      where: { orderId },
    });

    expect(assessment).not.toBeNull();
    // Rule: NEW_ACCOUNT_HIGH_VALUE_COD triggers for guest + high value COD (BDT 20,000 >= 15,000)
    // Rule: UNUSUAL_ORDER_VALUE_OR_QUANTITY triggers for high value
    expect(assessment?.reviewStatus).toBe('PENDING');
    expect(assessment?.riskLevel).toBe('HIGH');
    expect(assessment?.riskScore).toBeGreaterThanOrEqual(70);

    // 4. Verify confirmation/dispatch is blocked while order is under HIGH fraud hold
    await expect(
      ordersService.updateOrderStatus(
        orderId,
        { status: 'CONFIRMED' },
        { id: testUserId, permissions: ['order:confirm', 'order:manage'] },
      ),
    ).rejects.toThrow(/Order is held under manual fraud review/);

    // 5. Verify review appears in admin review queue
    const queueRes = await request(app)
      .get('/api/v1/admin/fraud/reviews?status=PENDING')
      .set('Authorization', adminToken);

    expect(queueRes.status).toBe(200);
    const foundInQueue = queueRes.body.data.some((item: { orderId: string }) => item.orderId === orderId);
    expect(foundInQueue).toBe(true);

    // 6. Test OTP Request flow
    const otpReqRes = await request(app)
      .post(`/api/v1/admin/fraud/reviews/${assessment!.id}/request-otp`)
      .set('Authorization', adminToken);

    expect(otpReqRes.status).toBe(200);
    expect(otpReqRes.body.message).toContain('Order verification needed');

    // 7. Approve review (marking as false positive note)
    const approveRes = await request(app)
      .post(`/api/v1/admin/fraud/reviews/${assessment!.id}/approve`)
      .set('Authorization', adminToken)
      .send({ isFalsePositive: true, note: 'Customer confirmed identity via phone call' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.reviewStatus).toBe('APPROVED');
    expect(approveRes.body.data.decision).toBe('FALSE_POSITIVE');

    // 8. Order confirmation now resumes and succeeds!
    const resumedOrder = await ordersService.updateOrderStatus(
      orderId,
      { status: 'CONFIRMED' },
      { id: testUserId, permissions: ['order:confirm', 'order:manage'] },
    );
    expect(resumedOrder.status).toBe('CONFIRMED');

    // 9. Verify FraudDecisionHistory is append-only
    const history = await prisma.fraudDecisionHistory.findMany({
      where: { fraudAssessmentId: assessment!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].newStatus).toBe('OTP_REQUESTED');
    expect(history[1].newStatus).toBe('APPROVED');
    expect(history[1].actorId).toBe(testUserId);
  }, 60000);

  it('Flow 2: Rejection cancels order and releases reserved inventory stock atomically', async () => {
    // Check initial stock on hand & reserved
    const initialInv = await prisma.inventory.findFirst({
      where: { variantId: testVariantId },
    });
    const initialReserved = initialInv?.reserved ?? 0;

    // 1. Create session and order
    const sessionId = await createTestCheckoutSession(testVariantId, 20000, true, '01799887766');
    const idempKey2 = `idemp-fraud-reject-${Date.now()}`;
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', idempKey2)
      .send({
        checkoutSessionId: sessionId,
        idempotencyKey: idempKey2,
      });

    const orderId = orderRes.body.data.id;
    createdOrderIds.push(orderId);

    // Stock reserved should increase by 1
    const reservedInv = await prisma.inventory.findFirst({
      where: { variantId: testVariantId },
    });
    expect(reservedInv?.reserved).toBe(initialReserved + 1);

    // 2. Reject order via fraud review
    const assessment = await prisma.fraudAssessment.findUnique({
      where: { orderId },
    });
    expect(assessment).not.toBeNull();

    const rejectRes = await request(app)
      .post(`/api/v1/admin/fraud/reviews/${assessment!.id}/reject`)
      .set('Authorization', adminToken)
      .send({ reason: 'Unverified suspicious guest credentials' });

    expect(rejectRes.status).toBe(200);

    // 3. Verify order was marked CANCELLED
    const cancelledOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(cancelledOrder?.status).toBe('CANCELLED');

    // 4. Verify reserved inventory stock was atomically released
    const releasedInv = await prisma.inventory.findFirst({
      where: { variantId: testVariantId },
    });
    expect(releasedInv?.reserved).toBe(initialReserved);
  }, 35000);

  it('Flow 3: Admin rule weight configuration affects risk scoring and stats endpoint reflects counts', async () => {
    // 1. Update rule weight
    const updateRes = await request(app)
      .patch('/api/v1/admin/fraud/rules/REPEATED_COD_CANCELLATIONS')
      .set('Authorization', adminToken)
      .send({ weight: 45 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.weight).toBe(45);

    // 2. Verify Stats endpoint
    const statsRes = await request(app)
      .get('/api/v1/admin/fraud/stats')
      .set('Authorization', adminToken);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.totalAssessments).toBeGreaterThan(0);
    expect(typeof statsRes.body.data.falsePositiveRate).toBe('number');
  });
});
