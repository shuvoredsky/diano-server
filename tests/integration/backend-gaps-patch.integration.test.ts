import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import Decimal from 'decimal.js';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { createTestSuperAdminAuth } from './test-auth-helper';
import { auditService } from '@/services/audit.service';
import { sslcommerzGateway } from '@/modules/payments/gateways/sslcommerz.gateway';

const isTestDbAvailable = Boolean(
  process.env.TEST_DATABASE_URL &&
    process.env.DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL,
);

describe.skipIf(!isTestDbAvailable)(
  'Backend Gaps & Operations Hardening Integration Tests (Real Neon DB)',
  { timeout: 120000, hookTimeout: 60000 },
  () => {
    let adminToken: string;
    let testAdminUserId: string;
    let testVariantId: string;
    let testVariantId2: string;
    let testProductId: string;
    let testCategoryId: string;
    let testCustomerId: string;

    const cleanupOrderIds: string[] = [];
    const cleanupRefundIds: string[] = [];
    const cleanupFlashSaleIds: string[] = [];
    const cleanupAuditIds: string[] = [];
    const cleanupUserIds: string[] = [];

    beforeAll(async () => {
      const auth = await createTestSuperAdminAuth();
      adminToken = `Bearer ${auth.token}`;
      testAdminUserId = auth.userId;
      cleanupUserIds.push(testAdminUserId);

      // Customer
      const cust = await prisma.user.create({
        data: {
          email: `cust_bg_${Date.now()}_${Math.floor(Math.random() * 1000)}@diano.test`,
          name: 'BG Test Customer',
          passwordHash: 'dummy_hash',
          status: 'ACTIVE',
        },
      });
      testCustomerId = cust.id;
      cleanupUserIds.push(testCustomerId);

      // Category & Product & Variants
      const cat = await prisma.category.create({
        data: {
          name: 'BG Test Category',
          slug: `bg-cat-${Date.now()}`,
          isActive: true,
        },
      });
      testCategoryId = cat.id;

      const prod = await prisma.product.create({
        data: {
          name: 'BG Test Product',
          slug: `bg-prod-${Date.now()}`,
          description: 'BG Test Product Description',
          categoryId: cat.id,
          status: 'PUBLISHED',
        },
      });
      testProductId = prod.id;

      const v1 = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          name: 'Variant 1',
          sku: `SKU-BG1-${Date.now()}`,
          price: new Decimal('1000.00'),
          costPrice: new Decimal('600.00'),
        },
      });
      testVariantId = v1.id;

      const v2 = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          name: 'Variant 2',
          sku: `SKU-BG2-${Date.now()}`,
          price: new Decimal('1500.00'),
          costPrice: new Decimal('900.00'),
        },
      });
      testVariantId2 = v2.id;
    });

    afterAll(async () => {
      try {
        if (cleanupRefundIds.length > 0) {
          await prisma.refund.deleteMany({ where: { id: { in: cleanupRefundIds } } });
        }
        if (cleanupFlashSaleIds.length > 0) {
          await prisma.flashSale.deleteMany({ where: { id: { in: cleanupFlashSaleIds } } });
        }
        if (cleanupOrderIds.length > 0) {
          await prisma.shipmentEvent.deleteMany({ where: { shipment: { orderId: { in: cleanupOrderIds } } } });
          await prisma.deliveryAttempt.deleteMany({ where: { shipment: { orderId: { in: cleanupOrderIds } } } });
          await prisma.shipment.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
          await prisma.payment.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
          await prisma.refund.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
          await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
          await prisma.orderItem.deleteMany({ where: { orderId: { in: cleanupOrderIds } } });
          await prisma.order.deleteMany({ where: { id: { in: cleanupOrderIds } } });
        }
        if (cleanupAuditIds.length > 0) {
          await prisma.auditLog.deleteMany({ where: { id: { in: cleanupAuditIds } } });
        }
        if (testVariantId || testVariantId2) {
          await prisma.productVariant.deleteMany({ where: { id: { in: [testVariantId, testVariantId2] } } });
        }
        if (testProductId) {
          await prisma.product.delete({ where: { id: testProductId } });
        }
        if (testCategoryId) {
          await prisma.category.delete({ where: { id: testCategoryId } });
        }
        if (cleanupUserIds.length > 0) {
          await prisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
          await prisma.userRole.deleteMany({ where: { userId: { in: cleanupUserIds } } });
          await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
        }
      } catch (err) {
        console.warn('Cleanup warning:', err);
      } finally {
        await prisma.$disconnect();
      }
    }, 60000);

    // =========================================================================
    // 1. REFUND CONCURRENCY & CAPPING (BG-27)
    // =========================================================================
    describe('Refund Concurrency, Balance Capping & Idempotency (BG-27)', () => {
      it('prevents concurrent refunds from exceeding paid amount and enforces idempotency', async () => {
        // Create order with 1000.00 total paid
        const order = await prisma.order.create({
          data: {
            orderNumber: `ORD-REF-${Date.now()}`,
            customerId: testCustomerId,
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            paymentMethod: 'COD',
            subtotal: new Decimal('1000.00'),
            discountTotal: new Decimal('0.00'),
            shippingTotal: new Decimal('0.00'),
            taxTotal: new Decimal('0.00'),
            grandTotal: new Decimal('1000.00'),
            shippingAddressSnapshot: { address: 'Mirpur, Dhaka', district: 'Dhaka' },
            customerSnapshot: { id: testCustomerId, name: 'Cust', phone: '01700000000' },
            payments: {
              create: {
                provider: 'COD',
                amount: new Decimal('1000.00'),
                currency: 'BDT',
                status: 'PAID',
              },
            },
          },
        });
        cleanupOrderIds.push(order.id);

        // A. Concurrently send two 800.00 refund requests (total requested: 1600 > 1000)
        const [res1, res2] = await Promise.all([
          request(app)
            .post(`/api/v1/admin/refunds/orders/${order.id}/refunds`)
            .set('Authorization', adminToken)
            .set('Idempotency-Key', `idemp-race-1-${Date.now()}`)
            .send({ amount: 800, reason: 'Concurrent refund attempt 1' }),
          request(app)
            .post(`/api/v1/admin/refunds/orders/${order.id}/refunds`)
            .set('Authorization', adminToken)
            .set('Idempotency-Key', `idemp-race-2-${Date.now()}`)
            .send({ amount: 800, reason: 'Concurrent refund attempt 2' }),
        ]);

        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([201, 400]);

        const successful = res1.status === 201 ? res1 : res2;
        const rejected = res1.status === 400 ? res1 : res2;

        expect(successful.body.data.amount).toBe('800.00');
        expect(rejected.body.message).toMatch(/exceeds maximum refundable balance|remaining refundable balance/);
        cleanupRefundIds.push(successful.body.data.id);

        // B. Idempotency replay with identical key returns 200/201 without creating new refund
        const replayRes = await request(app)
          .post(`/api/v1/admin/refunds/orders/${order.id}/refunds`)
          .set('Authorization', adminToken)
          .set('Idempotency-Key', successful.req.getHeader('Idempotency-Key') as string)
          .send({ amount: 800, reason: 'Duplicate replay attempt' });

        expect([200, 201]).toContain(replayRes.status);
        expect(replayRes.body.data.id).toBe(successful.body.data.id);

        // Verify total refunds in DB strictly equals 800.00
        const allRefunds = await prisma.refund.findMany({ where: { orderId: order.id } });
        expect(allRefunds).toHaveLength(1);
        expect(Number(allRefunds[0]?.amount)).toBe(800.00);
      });

      it('handles COD manual refund flow with manual reference and tracks status', async () => {
        const order = await prisma.order.create({
          data: {
            orderNumber: `ORD-COD-${Date.now()}`,
            customerId: testCustomerId,
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            paymentMethod: 'COD',
            subtotal: new Decimal('500.00'),
            discountTotal: new Decimal('0.00'),
            shippingTotal: new Decimal('0.00'),
            taxTotal: new Decimal('0.00'),
            grandTotal: new Decimal('500.00'),
            shippingAddressSnapshot: { address: 'Banani, Dhaka', district: 'Dhaka' },
            customerSnapshot: { id: testCustomerId, name: 'Cust', phone: '01700000000' },
            payments: {
              create: {
                provider: 'COD',
                amount: new Decimal('500.00'),
                currency: 'BDT',
                status: 'PAID',
              },
            },
          },
        });
        cleanupOrderIds.push(order.id);

        const refRes = await request(app)
          .post(`/api/v1/admin/refunds/orders/${order.id}/refunds`)
          .set('Authorization', adminToken)
          .send({
            amount: 500,
            reason: 'Manual cash settlement at counter',
            manualReference: 'MAN-CASH-9988',
          });

        expect(refRes.status).toBe(201);
        expect(refRes.body.data.status).toBe('COMPLETED');
        expect(refRes.body.data.providerRefundId).toBe('MAN-CASH-9988');
        cleanupRefundIds.push(refRes.body.data.id);

        const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
        expect(updatedOrder?.paymentStatus).toBe('REFUNDED');
      });

      it('rolls back completely when gateway rejects online refund without marking order REFUNDED', async () => {
        const order = await prisma.order.create({
          data: {
            orderNumber: `ORD-GATEWAY-FAIL-${Date.now()}`,
            customerId: testCustomerId,
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            paymentMethod: 'SSLCOMMERZ',
            subtotal: new Decimal('1200.00'),
            discountTotal: new Decimal('0.00'),
            shippingTotal: new Decimal('0.00'),
            taxTotal: new Decimal('0.00'),
            grandTotal: new Decimal('1200.00'),
            shippingAddressSnapshot: { address: 'Gulshan, Dhaka', district: 'Dhaka' },
            customerSnapshot: { id: testCustomerId, name: 'Cust', phone: '01700000000' },
            payments: {
              create: {
                provider: 'SSLCOMMERZ',
                amount: new Decimal('1200.00'),
                currency: 'BDT',
                status: 'PAID',
                bankTranId: 'BANK-TRAN-TEST-1234',
              },
            },
          },
        });
        cleanupOrderIds.push(order.id);

        // Spy gateway initiateRefund to fail
        const spy = vi.spyOn(sslcommerzGateway, 'initiateRefund').mockResolvedValueOnce({
          success: false,
          refundStatus: 'FAILED',
          errorMessage: 'Simulated SSLCOMMERZ gateway failure: Transaction expired for refund',
        });

        const failRes = await request(app)
          .post(`/api/v1/admin/refunds/orders/${order.id}/refunds`)
          .set('Authorization', adminToken)
          .send({
            amount: 1200,
            reason: 'Defective product online refund',
          });

        expect(failRes.status).toBe(502);
        expect(failRes.body.message).toContain('SSLCOMMERZ refund rejected');

        // Order and Payment must remain PAID, zero refunds recorded
        const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
        expect(finalOrder?.paymentStatus).toBe('PAID');

        const refundsInDb = await prisma.refund.findMany({ where: { orderId: order.id } });
        expect(refundsInDb).toHaveLength(0);

        spy.mockRestore();
      });
    });

    // =========================================================================
    // 2. FLASH SALE UPDATE, CANCEL & CONFLICT (BG-06)
    // =========================================================================
    describe('Flash Sale Management, Overlap Conflicts & Deletion (BG-06)', () => {
      let createdSaleId: string;

      it('creates, updates, validates overlap conflicts, and cancels flash sale', async () => {
        const now = Date.now();
        const startsAt = new Date(now + 2 * 3600 * 1000).toISOString();
        const endsAt = new Date(now + 8 * 3600 * 1000).toISOString();

        // A. Create flash sale
        const createRes = await request(app)
          .post('/api/v1/admin/flash-sales')
          .set('Authorization', adminToken)
          .send({
            title: 'Mid-Season Flash Sale',
            startsAt,
            endsAt,
            items: [
              {
                variantId: testVariantId,
                discountPrice: '750.00',
                stockLimit: 20,
              },
            ],
          });

        expect(createRes.status).toBe(201);
        createdSaleId = createRes.body.data.id;
        cleanupFlashSaleIds.push(createdSaleId);

        // B. Overlapping active flash sale for the same variant is blocked (400)
        const overlapRes = await request(app)
          .post('/api/v1/admin/flash-sales')
          .set('Authorization', adminToken)
          .send({
            title: 'Conflicting Flash Campaign',
            startsAt: new Date(now + 3 * 3600 * 1000).toISOString(),
            endsAt: new Date(now + 6 * 3600 * 1000).toISOString(),
            items: [
              {
                variantId: testVariantId,
                discountPrice: '600.00',
                stockLimit: 10,
              },
            ],
          });

        expect(overlapRes.status).toBe(400);
        expect(overlapRes.body.message).toContain('overlapping active flash sale');

        // C. Update flash sale schedule and title
        const updateRes = await request(app)
          .patch(`/api/v1/admin/flash-sales/${createdSaleId}`)
          .set('Authorization', adminToken)
          .send({
            title: 'Updated Mega Flash Sale',
            description: 'Extended holiday promotion',
          });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.data.title).toBe('Updated Mega Flash Sale');

        // D. Cancel flash sale
        const cancelRes = await request(app)
          .post(`/api/v1/admin/flash-sales/${createdSaleId}/cancel`)
          .set('Authorization', adminToken);

        expect(cancelRes.status).toBe(200);
        expect(cancelRes.body.data.isActive).toBe(false);

        // E. Deleting an unstarted future flash sale succeeds
        const deleteRes = await request(app)
          .delete(`/api/v1/admin/flash-sales/${createdSaleId}`)
          .set('Authorization', adminToken);

        expect(deleteRes.status).toBe(200);
        const exists = await prisma.flashSale.findUnique({ where: { id: createdSaleId } });
        expect(exists).toBeNull();
      });

      it('rejects deletion of a flash sale that has already started', async () => {
        // Create already started flash sale
        const startedSale = await prisma.flashSale.create({
          data: {
            title: 'Active Started Sale',
            startsAt: new Date(Date.now() - 3600 * 1000), // 1 hr ago
            endsAt: new Date(Date.now() + 3600 * 1000),
            isActive: true,
            items: {
              create: [
                {
                  variantId: testVariantId2,
                  discountPrice: new Decimal('1100.00'),
                  stockLimit: 15,
                },
              ],
            },
          },
        });
        cleanupFlashSaleIds.push(startedSale.id);

        const delRes = await request(app)
          .delete(`/api/v1/admin/flash-sales/${startedSale.id}`)
          .set('Authorization', adminToken);

        expect(delRes.status).toBe(400);
        expect(delRes.body.message).toContain('Cannot delete a flash sale that has already started');
      });
    });

    // =========================================================================
    // 3. SHIPPED RULE: REQUIRES SHIPMENT ROW WITH COURIER (BG-26)
    // =========================================================================
    describe('SHIPPED Transition Guard (BG-26)', () => {
      it('blocks order status SHIPPED without shipment row, then allows after tracking added', async () => {
        const order = await prisma.order.create({
          data: {
            orderNumber: `ORD-SHIP-GUARD-${Date.now()}`,
            customerId: testCustomerId,
            status: 'PACKED',
            paymentStatus: 'PAID',
            paymentMethod: 'COD',
            subtotal: new Decimal('2000.00'),
            discountTotal: new Decimal('0.00'),
            shippingTotal: new Decimal('60.00'),
            taxTotal: new Decimal('0.00'),
            grandTotal: new Decimal('2060.00'),
            shippingAddressSnapshot: { address: 'Dhanmondi 27', district: 'Dhaka' },
            customerSnapshot: { id: testCustomerId, name: 'Cust', phone: '01700000000' },
          },
        });
        cleanupOrderIds.push(order.id);

        // A. Attempting transition to SHIPPED without shipment row fails (400)
        const rejectRes = await request(app)
          .patch(`/api/v1/admin/orders/${order.id}/status`)
          .set('Authorization', adminToken)
          .send({ status: 'SHIPPED', note: 'Direct transition attempt' });

        expect(rejectRes.status).toBe(400);
        expect(rejectRes.body.message).toContain('Cannot transition order to SHIPPED without an existing shipment record');

        // B. Add shipment record with courier name
        await prisma.shipment.create({
          data: {
            orderId: order.id,
            courierName: 'RedX Courier',
            trackingNumber: `REDX-${Date.now()}`,
            status: 'PICKED_UP',
          },
        });

        // C. Transitioning to SHIPPED now succeeds
        const successRes = await request(app)
          .patch(`/api/v1/admin/orders/${order.id}/status`)
          .set('Authorization', adminToken)
          .send({ status: 'SHIPPED', note: 'Transition after shipment generated' });

        expect(successRes.status).toBe(200);
        expect(successRes.body.data.status).toBe('SHIPPED');

        const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
        expect(finalOrder?.status).toBe('SHIPPED');
        expect(finalOrder?.shippedAt).not.toBeNull();
      });
    });

    // =========================================================================
    // 4. AUDIT REDACTION
    // =========================================================================
    describe('Audit Log Sensitive Field Redaction Before Storing', () => {
      it('recursively redacts password, token, secret, cookie, authorization, otp, and card before writing to DB', async () => {
        const uniqueAction = `TEST_REDACTION_${Date.now()}`;

        await auditService.record({
          actorId: testAdminUserId,
          actorType: 'USER',
          action: uniqueAction,
          targetType: 'SYSTEM',
          metadata: {
            safeKey: 'diano_platform',
            password: 'super_secret_password',
            accessToken: 'jwt.token.here',
            clientSecret: 'secret_key_123',
            sessionCookie: 'sid=999abc',
            authorization: 'Bearer token123',
            smsOtp: '554433',
            creditCard: '4111222233334444',
            nestedConfig: {
              apiToken: 'api_key_secret',
              cardCvv: '123',
              safeChild: 'allowed_child_data',
            },
          },
        });

        const stored = await prisma.auditLog.findFirst({
          where: { action: uniqueAction },
        });

        expect(stored).not.toBeNull();
        cleanupAuditIds.push(stored!.id);

        const meta = stored!.metadata as Record<string, unknown>;
        expect(meta.safeKey).toBe('diano_platform');

        // All 7 sensitive fields must be stripped completely
        expect(meta.password).toBeUndefined();
        expect(meta.accessToken).toBeUndefined();
        expect(meta.clientSecret).toBeUndefined();
        expect(meta.sessionCookie).toBeUndefined();
        expect(meta.authorization).toBeUndefined();
        expect(meta.smsOtp).toBeUndefined();
        expect(meta.creditCard).toBeUndefined();

        // Nested fields
        const nested = meta.nestedConfig as Record<string, unknown>;
        expect(nested.safeChild).toBe('allowed_child_data');
        expect(nested.apiToken).toBeUndefined();
        expect(nested.cardCvv).toBeUndefined();
      });
    });
  },
);
