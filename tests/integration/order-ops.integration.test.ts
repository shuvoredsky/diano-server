import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { createTestSuperAdminAuth, createTestCustomerAuth } from './test-auth-helper';
import type { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';

describe('M12 Order Operations Integration Tests (Shipping, Coupons, Returns, Refunds)', () => {
  let adminToken: string;
  let _adminUserId: string;
  let customerToken: string;
  let customerUserId: string;

  let testWarehouseId: string;
  let testProductId: string;
  let testVariantId: string;

  const cleanupZoneIds: string[] = [];
  const cleanupCouponIds: string[] = [];
  const cleanupOrderIds: string[] = [];
  const cleanupSessionIds: string[] = [];

  beforeAll(async () => {
    // 1. Setup authenticated users
    const adminAuth = await createTestSuperAdminAuth();
    adminToken = `Bearer ${adminAuth.token}`;
    _adminUserId = adminAuth.userId;

    const customerAuth = await createTestCustomerAuth();
    customerToken = `Bearer ${customerAuth.token}`;
    customerUserId = customerAuth.userId;

    // 2. Setup warehouse
    let warehouse = await prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (!warehouse) {
      warehouse = await prisma.warehouse.create({
        data: {
          name: 'Main Central Hub',
          code: `WH-OPS-${Date.now().toString().slice(-4)}`,
          district: 'Dhaka',
          address: 'Tejgaon Industrial Area',
          isDefault: true,
          isActive: true,
        },
      });
    }
    testWarehouseId = warehouse.id;

    // 3. Setup category, product and variant
    let category = await prisma.category.findFirst({ where: { isActive: true } });
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: 'Ops Apparel',
          slug: `ops-apparel-${Date.now()}`,
          isActive: true,
        },
      });
    }

    const product = await prisma.product.create({
      data: {
        name: 'Ops Silk Shirt',
        slug: `ops-silk-shirt-${Date.now()}`,
        description: 'Silk shirt for operations testing',
        categoryId: category.id,
        status: 'PUBLISHED',
      },
    });
    testProductId = product.id;

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Ops Variant L',
        sku: `OPS-SLK-${Date.now()}`,
        price: '1500.00',
        isActive: true,
      },
    });
    testVariantId = variant.id;

    // Initial stock
    await prisma.inventory.upsert({
      where: {
        variantId_warehouseId: {
          variantId: variant.id,
          warehouseId: testWarehouseId,
        },
      },
      create: {
        variantId: variant.id,
        warehouseId: testWarehouseId,
        onHand: 100,
        reserved: 0,
      },
      update: {
        onHand: 100,
        reserved: 0,
      },
    });
  });

  afterAll(async () => {
    // Clean up created entities in reverse foreign key order
    try {
      if (cleanupOrderIds.length > 0) {
        await prisma.refund.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.returnItem.deleteMany({
          where: { returnRequest: { orderId: { in: cleanupOrderIds } } },
        });
        await prisma.returnRequest.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.shipmentEvent.deleteMany({
          where: { shipment: { orderId: { in: cleanupOrderIds } } },
        });
        await prisma.deliveryAttempt.deleteMany({
          where: { shipment: { orderId: { in: cleanupOrderIds } } },
        });
        await prisma.shipment.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.couponUsage.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.payment.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.orderNote.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.orderItem.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.fraudAssessment.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: cleanupOrderIds } } });
      }

      if (cleanupCouponIds.length > 0) {
        await prisma.couponUsage.deleteMany({ where: { couponId: { in: cleanupCouponIds } } });
        await prisma.coupon.deleteMany({ where: { id: { in: cleanupCouponIds } } });
      }

      if (cleanupZoneIds.length > 0) {
        await prisma.shippingMethod.deleteMany({ where: { shippingZoneId: { in: cleanupZoneIds } } });
        await prisma.shippingZone.deleteMany({ where: { id: { in: cleanupZoneIds } } });
      }

      if (cleanupSessionIds.length > 0) {
        await prisma.checkoutEvent.deleteMany({ where: { checkoutSessionId: { in: cleanupSessionIds } } });
        await prisma.checkoutSession.deleteMany({ where: { id: { in: cleanupSessionIds } } });
      }

      // Note: StockMovement has an append-only trigger in PostgreSQL.
      // We do not delete StockMovement rows per docs/AGENT_RULES.md.
    } catch {
      // Ignore cleanup error
    }
  });

  // Helper to create an active checkout session
  async function createCheckoutSession(
    variantId: string,
    quantity: number,
    userId: string,
    district = 'Dhaka',
  ): Promise<string> {
    const sessionId = `ops-sess-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const lineTotal = (1500 * quantity).toFixed(2);
    const subtotal = lineTotal;
    const shipping = '60.00';
    const grandTotal = (Number(subtotal) + Number(shipping)).toFixed(2);

    const cartSnapshot = {
      items: [
        {
          variantId,
          price: '1500.00',
          quantity,
          lineTotal,
        },
      ],
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '01711223344',
        address: 'House 12, Road 4',
        district,
      },
      paymentMethod: {
        provider: 'COD',
      },
      customerInfo: {
        name: 'Test Customer',
        phone: '01711223344',
      },
      shippingCharge: shipping,
      discount: '0.00',
      grandTotal,
    };

    const session = await prisma.checkoutSession.create({
      data: {
        sessionId,
        userId,
        status: 'ACTIVE',
        cartSnapshot: cartSnapshot as unknown as Prisma.InputJsonValue,
        checkoutValue: Number(grandTotal),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    cleanupSessionIds.push(session.id);
    return session.sessionId;
  }

  // ==========================================
  // FLOW 1: SHIPPING & SHIPMENT STATE MACHINE
  // ==========================================
  describe('Flow 1: ShippingZone, Methods & Shipment State Machine', () => {
    let createdZoneId: string;
    let createdOrderId: string;
    let createdShipmentId: string;

    it('creates a custom shipping zone and method via admin endpoints', async () => {
      // 1. Create Zone
      const zoneRes = await request(app)
        .post('/api/v1/admin/shipping/zones')
        .set('Authorization', adminToken)
        .send({
          name: 'Sylhet Special Division',
          districts: ['Sylhet', 'Moulvibazar', 'Habiganj'],
          isActive: true,
        });

      expect(zoneRes.status).toBe(201);
      createdZoneId = zoneRes.body.data.id;
      cleanupZoneIds.push(createdZoneId);

      // 2. Create Shipping Method for zone
      const methodRes = await request(app)
        .post('/api/v1/admin/shipping/methods')
        .set('Authorization', adminToken)
        .send({
          shippingZoneId: createdZoneId,
          name: 'Sylhet Fast Track',
          code: `SYL-FAST-${Date.now().toString().slice(-4)}`,
          baseCharge: '110.00',
          freeShippingThreshold: '2500.00',
          estimatedDays: '2-3 days',
        });

      expect(methodRes.status).toBe(201);
      expect(methodRes.body.data.baseCharge).toBe('110.00');
    });

    it('calculates shipping methods based on district and threshold via public endpoint', async () => {
      // Below threshold (1000 < 2500) -> base charge applied
      const calcRes1 = await request(app)
        .get('/api/v1/shipping/methods?district=Sylhet&subtotal=1000.00');

      expect(calcRes1.status).toBe(200);
      expect(calcRes1.body.data.length).toBeGreaterThan(0);
      const sylhetMethod = calcRes1.body.data.find((m: { zoneName: string }) =>
        m.zoneName.includes('Sylhet'),
      );
      expect(sylhetMethod).toBeDefined();
      expect(sylhetMethod.calculatedCharge).toBe('110.00');
      expect(sylhetMethod.isFreeShipping).toBe(false);

      // Above threshold (3000 >= 2500) -> free shipping applied
      const calcRes2 = await request(app)
        .get('/api/v1/shipping/methods?district=Sylhet&subtotal=3000.00');

      expect(calcRes2.status).toBe(200);
      const freeSylhetMethod = calcRes2.body.data.find((m: { zoneName: string }) =>
        m.zoneName.includes('Sylhet'),
      );
      expect(freeSylhetMethod.calculatedCharge).toBe('0.00');
      expect(freeSylhetMethod.isFreeShipping).toBe(true);
    });

    it('creates an order, books a shipment, and state machine hooks advance order status to DELIVERED', async () => {
      // 1. Place order
      const publicSessionId = await createCheckoutSession(testVariantId, 2, customerUserId, 'Sylhet');
      const session = await prisma.checkoutSession.findUnique({ where: { sessionId: publicSessionId } });

      const idempKey = `idemp-ship-${Date.now()}`;
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', customerToken)
        .set('Idempotency-Key', idempKey)
        .send({
          checkoutSessionId: session!.id,
          idempotencyKey: idempKey,
        });

      expect(orderRes.status).toBe(201);
      createdOrderId = orderRes.body.data.id;
      cleanupOrderIds.push(createdOrderId);

      // 2. Advance order from PENDING to CONFIRMED and approve fraud hold
      await prisma.order.update({
        where: { id: createdOrderId },
        data: { status: 'CONFIRMED' },
      });
      await prisma.fraudAssessment.updateMany({
        where: { orderId: createdOrderId },
        data: { reviewStatus: 'APPROVED' },
      });

      // 3. Admin creates shipment with PICKED_UP
      const shipRes = await request(app)
        .post(`/api/v1/admin/orders/${createdOrderId}/shipments`)
        .set('Authorization', adminToken)
        .send({
          courierName: 'Steadfast Courier',
          status: 'PICKED_UP',
        });

      expect(shipRes.status).toBe(201);
      expect(shipRes.body.data.trackingNumber).toBeDefined();
      createdShipmentId = shipRes.body.data.id;

      // Verify order automatically transitioned to SHIPPED
      const shippedOrder = await prisma.order.findUnique({ where: { id: createdOrderId } });
      expect(shippedOrder?.status).toBe('SHIPPED');

      // 4. Update shipment status to DELIVERED
      const deliveredRes = await request(app)
        .patch(`/api/v1/admin/shipments/${createdShipmentId}/status`)
        .set('Authorization', adminToken)
        .send({
          status: 'DELIVERED',
          note: 'Package signed and handed to customer',
        });

      expect(deliveredRes.status).toBe(200);

      // Verify state machine hook automatically marked Order as DELIVERED
      const deliveredOrder = await prisma.order.findUnique({ where: { id: createdOrderId } });
      expect(deliveredOrder?.status).toBe('DELIVERED');
      expect(deliveredOrder?.deliveredAt).not.toBeNull();
    }, 60000);
  });

  // ==========================================
  // FLOW 2: COUPONS & ATOMIC CONCURRENCY
  // ==========================================
  describe('Flow 2: Coupon Creation, Checkout Session, and Atomic Usage', () => {
    let createdCouponId: string;
    let couponCode: string;

    it('creates a coupon via admin endpoint and applies to checkout session', async () => {
      couponCode = `DIANO500-${Date.now().toString().slice(-4)}`;

      // 1. Create Coupon
      const couponRes = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', adminToken)
        .send({
          code: couponCode,
          type: 'FIXED',
          value: '500.00',
          minPurchase: '1000.00',
          startsAt: new Date(Date.now() - 3600000),
          expiresAt: new Date(Date.now() + 86400000),
          usageLimit: 5,
          perUserLimit: 2,
        });

      expect(couponRes.status).toBe(201);
      createdCouponId = couponRes.body.data.id;
      cleanupCouponIds.push(createdCouponId);

      // 2. Apply coupon to checkout session
      const publicSessionId = await createCheckoutSession(testVariantId, 2, customerUserId);

      const applyRes = await request(app)
        .post(`/api/v1/checkout/sessions/${publicSessionId}/coupon`)
        .set('Authorization', customerToken)
        .send({ code: couponCode });

      expect(applyRes.status).toBe(200);
      expect(applyRes.body.data.discountAmount).toBe('500.00');

      // 3. Remove coupon from checkout session
      const removeRes = await request(app)
        .delete(`/api/v1/checkout/sessions/${publicSessionId}/coupon`)
        .set('Authorization', customerToken);

      expect(removeRes.status).toBe(200);

      // 4. Re-apply coupon and convert to order
      await request(app)
        .post(`/api/v1/checkout/sessions/${publicSessionId}/coupon`)
        .set('Authorization', customerToken)
        .send({ code: couponCode });

      const session = await prisma.checkoutSession.findUnique({ where: { sessionId: publicSessionId } });
      const idempKey = `idemp-coupon-${Date.now()}`;
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', customerToken)
        .set('Idempotency-Key', idempKey)
        .send({
          checkoutSessionId: session!.id,
          idempotencyKey: idempKey,
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.id;
      cleanupOrderIds.push(orderId);

      // Verify order saved discountTotal and couponId
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(new Decimal(order!.discountTotal).toFixed(2)).toBe('500.00');
      expect(order?.couponId).toBe(createdCouponId);

      // Verify CouponUsage record was atomically created
      const usage = await prisma.couponUsage.findFirst({
        where: { couponId: createdCouponId, orderId },
      });
      expect(usage).not.toBeNull();
      expect(new Decimal(usage!.discountAmount).toFixed(2)).toBe('500.00');

      // Verify usedCount on coupon incremented
      const updatedCoupon = await prisma.coupon.findUnique({ where: { id: createdCouponId } });
      expect(updatedCoupon?.usedCount).toBe(1);
    }, 60000);

    it('concurrent checkout orders with usageLimit: 1 => exactly 1 succeeds and second fails (COUPON_EXHAUSTED)', async () => {
      const limitedCode = `RACE1-${Date.now().toString().slice(-4)}`;
      const limitCouponRes = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', adminToken)
        .send({
          code: limitedCode,
          type: 'FIXED',
          value: '100.00',
          minPurchase: '500.00',
          startsAt: new Date(Date.now() - 3600000),
          expiresAt: new Date(Date.now() + 86400000),
          usageLimit: 1,
          perUserLimit: 1,
          isActive: true,
        });
      expect(limitCouponRes.status).toBe(201);
      const couponId = limitCouponRes.body.data.id;
      cleanupCouponIds.push(couponId);

      // Create 2 checkout sessions referencing this coupon
      const sessionIds = await Promise.all(
        Array.from({ length: 2 }).map(async () => {
          const sessId = await createCheckoutSession(testVariantId, 1);
          const s = await prisma.checkoutSession.findUnique({ where: { sessionId: sessId } });
          await prisma.checkoutSession.update({
            where: { id: s!.id },
            data: {
              cartSnapshot: {
                ...(s!.cartSnapshot as Record<string, unknown>),
                couponId,
                couponCode: limitedCode,
                discount: '100.00',
              } as unknown as Prisma.InputJsonValue,
            },
          });
          return s!.id;
        }),
      );

      // Submit 2 orders concurrently
      const responses = await Promise.all(
        sessionIds.map(sId =>
          request(app)
            .post('/api/v1/orders')
            .set('Idempotency-Key', `race-coupon-${sId}-${Date.now()}`)
            .send({ checkoutSessionId: sId }),
        ),
      );

      const successful = responses.filter(r => r.status === 201);
      const rejected = responses.filter(r => r.status === 400);

      expect(successful.length).toBe(1);
      expect(rejected.length).toBe(1);
      for (const rej of rejected) {
        expect(rej.body.message).toContain('Coupon usage limit reached');
      }
      cleanupOrderIds.push(successful[0].body.data.id);

      const finalCoupon = await prisma.coupon.findUnique({ where: { id: couponId } });
      expect(finalCoupon?.usedCount).toBe(1);
    }, 60000);
  });

  // ==========================================
  // FLOW 3: RETURNS, INSPECTION, RESTOCK & REFUNDS
  // ==========================================
  describe('Flow 3: Returns, Restock Movement & Proportional Refunds', () => {
    let deliveredOrderId: string;
    let orderItemId: string;
    let returnRequestId: string;

    beforeAll(async () => {
      // Create a delivered order with 2 items
      const publicSessionId = await createCheckoutSession(testVariantId, 2, customerUserId);
      const session = await prisma.checkoutSession.findUnique({ where: { sessionId: publicSessionId } });

      const idempKey = `idemp-ret-${Date.now()}`;
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', customerToken)
        .set('Idempotency-Key', idempKey)
        .send({
          checkoutSessionId: session!.id,
          idempotencyKey: idempKey,
        });

      deliveredOrderId = orderRes.body.data.id;
      cleanupOrderIds.push(deliveredOrderId);

      // Advance to DELIVERED status
      await prisma.order.update({
        where: { id: deliveredOrderId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });

      const order = await prisma.order.findUnique({
        where: { id: deliveredOrderId },
        include: { items: true },
      });
      orderItemId = order!.items[0]!.id;
    });

    it('customer creates a return request for delivered order item', async () => {
      const returnRes = await request(app)
        .post(`/api/v1/orders/${deliveredOrderId}/returns`)
        .set('Authorization', customerToken)
        .send({
          customerNote: 'Size did not fit properly',
          items: [{ orderItemId, quantity: 1 }],
        });

      expect(returnRes.status).toBe(201);
      expect(returnRes.body.data.returnNumber).toMatch(/^RET-/);
      expect(returnRes.body.data.status).toBe('REQUESTED');
      returnRequestId = returnRes.body.data.id;

      // Customer views own return list
      const myReturnsRes = await request(app)
        .get('/api/v1/orders/returns/my')
        .set('Authorization', customerToken);

      expect(myReturnsRes.status).toBe(200);
      expect(myReturnsRes.body.data.some((r: { id: string }) => r.id === returnRequestId)).toBe(true);
    });

    it('admin approves return and inspects items, triggering RETURN_RESTOCK movement and refund amount calculation', async () => {
      // 1. Admin reviews and approves
      const reviewRes = await request(app)
        .post(`/api/v1/admin/returns/${returnRequestId}/review`)
        .set('Authorization', adminToken)
        .send({
          action: 'APPROVE',
          staffNote: 'Approved for inspection at central warehouse',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('APPROVED');

      // 2. Admin receives and inspects return item
      const returnReqBefore = await prisma.returnRequest.findUnique({
        where: { id: returnRequestId },
        include: { items: true },
      });
      const retItemId = returnReqBefore!.items[0]!.id;

      const inspectRes = await request(app)
        .post(`/api/v1/admin/returns/${returnRequestId}/receive`)
        .set('Authorization', adminToken)
        .send({
          items: [
            {
              itemId: retItemId,
              condition: 'GOOD',
              action: 'REFUND',
              warehouseId: testWarehouseId,
            },
          ],
          staffNote: 'Item in mint condition, approved for restock and refund',
        });

      expect(inspectRes.status).toBe(200);
      expect(inspectRes.body.data.status).toBe('INSPECTED');
      expect(inspectRes.body.data.refundAmount).toBe('1500.00');

      // 3. Verify StockMovement was recorded with type RETURN_RESTOCK
      const movement = await prisma.stockMovement.findFirst({
        where: {
          variantId: testVariantId,
          type: 'RETURN_RESTOCK',
          referenceId: returnRequestId,
        },
      });
      expect(movement).not.toBeNull();
      expect(movement?.quantity).toBe(1);

      // 4. Admin executes the refund
      const idempRefundKey = `idemp-ref-${Date.now()}`;
      const refundRes = await request(app)
        .post(`/api/v1/admin/returns/${returnRequestId}/refund`)
        .set('Authorization', adminToken)
        .set('Idempotency-Key', idempRefundKey)
        .send({
          reason: 'Customer return refund after inspection',
        });

      expect(refundRes.status).toBe(201);
      expect(refundRes.body.data.amount).toBe('1500.00');
      expect(refundRes.body.data.status).toBe('COMPLETED');

      // 5. Verify ReturnRequest is marked REFUNDED
      const finalReturnReq = await prisma.returnRequest.findUnique({ where: { id: returnRequestId } });
      expect(finalReturnReq?.status).toBe('REFUNDED');
      expect(finalReturnReq?.completedAt).not.toBeNull();

      // 6. Verify Order paymentStatus is updated
      const finalOrder = await prisma.order.findUnique({ where: { id: deliveredOrderId } });
      expect(finalOrder?.paymentStatus).toBe('PARTIALLY_REFUNDED');

      // 7. Duplicate refund replay with identical Idempotency-Key returns existing refund (idempotent)
      const duplicateRefundRes = await request(app)
        .post(`/api/v1/admin/returns/${returnRequestId}/refund`)
        .set('Authorization', adminToken)
        .set('Idempotency-Key', idempRefundKey)
        .send({
          reason: 'Customer return refund after inspection',
        });
      expect([200, 201]).toContain(duplicateRefundRes.status);
      expect(duplicateRefundRes.body.data.id).toBe(refundRes.body.data.id);

      // 8. Attempting refund exceeding remaining refundable balance is rejected with 400
      const overlimitRes = await request(app)
        .post(`/api/v1/admin/refunds/orders/${deliveredOrderId}/refunds`)
        .set('Authorization', adminToken)
        .set('Idempotency-Key', `idemp-overlimit-${Date.now()}`)
        .send({
          amount: '999999.00',
          reason: 'Excessive refund test',
        });
      expect(overlimitRes.status).toBe(400);
      expect(overlimitRes.body.message).toMatch(/exceeds/i);
    }, 60000);
  });
});
