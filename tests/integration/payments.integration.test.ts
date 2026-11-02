import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { createTestSuperAdminAuth } from './test-auth-helper';
import { paymentsService } from '@/modules/payments/payments.service';
import { paymentGatewayRegistry } from '@/modules/payments/gateways/gateway.registry';
import { inventoryService } from '@/modules/inventory/inventory.service';
import type { PaymentGateway } from '@/modules/payments/payments.types';

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
  'Payments Integration Tests (Real Neon DB)',
  () => {
    let testAdminUserId: string;
    let defaultWarehouseId: string;
    let testCustomerId: string;
    let testVariantId: string;
    let testProductId: string;
    let testCategoryId: string;

    const createdOrderIds: string[] = [];
    const createdPaymentIds: string[] = [];
    const createdUserIds: string[] = [];

    // Mock Gateway for testing HTTP callbacks without hitting live SSLCOMMERZ servers
    let mockSslGateway: PaymentGateway;

    beforeAll(async () => {
      // 1. Auth setup
      const auth = await createTestSuperAdminAuth();
      testAdminUserId = auth.userId;
      createdUserIds.push(testAdminUserId);

      // 2. Default warehouse
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

      // 3. Customer User
      const customer = await prisma.user.create({
        data: {
          email: `cust_${Date.now()}_${Math.floor(Math.random() * 1000)}@diano.test`,
          name: 'Payment Test Customer',
          passwordHash: 'dummy_hash',
          status: 'ACTIVE',
        },
      });
      testCustomerId = customer.id;
      createdUserIds.push(testCustomerId);

      // 4. Catalog setup (Category, Product, Variant, Inventory)
      const cat = await prisma.category.create({
        data: {
          name: 'Payment Integration Category',
          slug: `pay-cat-${Date.now()}`,
          isActive: true,
        },
      });
      testCategoryId = cat.id;

      const prod = await prisma.product.create({
        data: {
          name: 'Payment Test T-Shirt',
          slug: `pay-prod-${Date.now()}`,
          description: 'Payment Test T-Shirt Description',
          categoryId: testCategoryId,
          status: 'PUBLISHED',
        },
      });
      testProductId = prod.id;

      const variant = await prisma.productVariant.create({
        data: {
          productId: testProductId,
          name: 'Default Black',
          sku: `PAY-SKU-${Date.now()}`,
          price: 1000.0,
          isActive: true,
        },
      });
      testVariantId = variant.id;

      await prisma.inventory.upsert({
        where: {
          variantId_warehouseId: {
            variantId: testVariantId,
            warehouseId: defaultWarehouseId,
          },
        },
        update: { onHand: 100, reserved: 0, damaged: 0, safetyStock: 5 },
        create: {
          variantId: testVariantId,
          warehouseId: defaultWarehouseId,
          onHand: 100,
          reserved: 0,
          damaged: 0,
          safetyStock: 5,
        },
      });

      // 5. Setup mock SSLCOMMERZ gateway in registry for deterministic testing
      mockSslGateway = {
        provider: 'SSLCOMMERZ',
        initialize: vi.fn().mockImplementation(async input => ({
          gatewayUrl: `https://sandbox.sslcommerz.com/EasyCheckOut/mock-${input.transactionId}`,
          sessionKey: `SESSION-${input.transactionId}`,
        })),
        verify: vi.fn(),
        handleCallback: vi.fn().mockImplementation(async payload => ({
          success: payload.status === 'VALID',
          transactionId: payload.tran_id,
          valId: payload.val_id,
          status: payload.status,
          rawPayload: payload,
        })),
        handleIpn: vi.fn().mockImplementation(async payload => ({
          isAuthentic: true,
          transactionId: payload.tran_id,
          valId: payload.val_id,
          status: payload.status,
          rawPayload: payload,
        })),
        initiateRefund: vi.fn().mockResolvedValue({
          success: true,
          refundStatus: 'COMPLETED',
          providerRefundId: `REF-${Date.now()}`,
        }),
        verifyRefund: vi.fn().mockResolvedValue({
          success: true,
          refundStatus: 'COMPLETED',
        }),
        queryTransaction: vi.fn().mockResolvedValue({
          status: 'PAID',
          transactionId: 'MOCK',
        }),
      };

      paymentGatewayRegistry.registerGateway('SSLCOMMERZ', mockSslGateway);
    });

    afterAll(async () => {
      // Targeted cleanup — NEVER delete from StockMovement
      if (createdOrderIds.length > 0) {
        await prisma.refund.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.paymentEvent.deleteMany({ where: { payment: { orderId: { in: createdOrderIds } } } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }

      if (testVariantId) {
        await prisma.inventory.deleteMany({ where: { variantId: testVariantId } }).catch(() => {});
        await prisma.productVariant.updateMany({
          where: { id: testVariantId },
          data: { deletedAt: new Date() },
        }).catch(() => {});
      }
      if (testProductId) {
        await prisma.product.updateMany({
          where: { id: testProductId },
          data: { deletedAt: new Date() },
        }).catch(() => {});
      }
      if (testCategoryId) {
        await prisma.category.updateMany({
          where: { id: testCategoryId },
          data: { deletedAt: new Date() },
        }).catch(() => {});
      }
      if (createdUserIds.length > 0) {
        await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
        await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
      }
    });

    /**
     * Helper to create a test order in PENDING status with reserved stock
     */
    async function createTestOrder(quantity = 2, grandTotal = 2000.0) {
      const orderNumber = `DN-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

      // Reserve stock first as done during order placement
      await inventoryService.reserveStock({
        variantId: testVariantId,
        warehouseId: defaultWarehouseId,
        quantity,
        referenceType: 'ORDER',
        referenceId: orderNumber,
        reason: 'Order placed reservation',
      });

      const order = await prisma.order.create({
        data: {
          orderNumber,
          customerId: testCustomerId,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: 'SSLCOMMERZ',
          subtotal: grandTotal,
          grandTotal,
          customerSnapshot: { id: testCustomerId, name: 'Payment Customer' },
          shippingAddressSnapshot: { address1: 'Dhanmondi', city: 'Dhaka' },
          items: {
            create: {
              variantId: testVariantId,
              productName: 'Payment Test T-Shirt',
              variantName: 'Default',
              sku: 'SKU-001',
              unitPrice: 1000.0,
              quantity,
              lineTotal: grandTotal,
            },
          },
        },
      });

      createdOrderIds.push(order.id);
      return order;
    }

    it('Payment Success: atomically confirms order and commits stock exactly once under concurrent IPN + redirect race', async () => {
      const order = await createTestOrder(2, 2000.0);

      // Check stock before payment
      const invBefore = await prisma.inventory.findUniqueOrThrow({
        where: {
          variantId_warehouseId: {
            variantId: testVariantId,
            warehouseId: defaultWarehouseId,
          },
        },
      });
      const initialOnHand = invBefore.onHand;
      const initialReserved = invBefore.reserved;

      // Initiate payment
      const initRes = await paymentsService.initiatePayment(
        { orderId: order.id },
        { userId: testCustomerId },
      );
      expect(initRes.gatewayUrl).toBeDefined();
      expect(initRes.transactionId).toBeDefined();

      const transactionId = initRes.transactionId;
      const valId = `VAL-${transactionId}`;

      // Mock gateway verification to return valid BDT 2000
      (mockSslGateway.verify as any).mockResolvedValue({
        isValid: true,
        status: 'VALID',
        transactionId,
        bankTranId: `BANK-TRAN-${Date.now()}`,
        amount: 2000.0,
        currency: 'BDT',
      });

      // Execute redirect callback and IPN in parallel (race condition simulation)
      const [callbackResult, ipnResult] = await Promise.all([
        paymentsService.handleSslCallback('success', {
          tran_id: transactionId,
          val_id: valId,
        }),
        paymentsService.handleSslIpn({
          tran_id: transactionId,
          val_id: valId,
          verify_sign: 'valid_mock_signature',
          verify_key: 'amount,currency,status,tran_id,val_id',
        }),
      ]);

      expect(callbackResult.redirectUrl).toContain('status=success');
      expect(['processed', 'already_paid_noop']).toContain(ipnResult.status);

      // Verify database state:
      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe('CONFIRMED');
      expect(updatedOrder.paymentStatus).toBe('PAID');

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { provider_transactionId: { provider: 'SSLCOMMERZ', transactionId } },
      });
      expect(payment.status).toBe('PAID');
      expect(payment.paidAt).not.toBeNull();

      // Check stock: reservation must be committed exactly once (reserved - 2, onHand - 2)
      const invAfter = await prisma.inventory.findUniqueOrThrow({
        where: {
          variantId_warehouseId: {
            variantId: testVariantId,
            warehouseId: defaultWarehouseId,
          },
        },
      });

      expect(invAfter.onHand).toBe(initialOnHand - 2);
      expect(invAfter.reserved).toBe(initialReserved - 2);
    });

    it('Payment Failure: releases reserved stock and leaves order in PENDING status for retry', async () => {
      const order = await createTestOrder(3, 3000.0);

      const invBefore = await prisma.inventory.findUniqueOrThrow({
        where: {
          variantId_warehouseId: {
            variantId: testVariantId,
            warehouseId: defaultWarehouseId,
          },
        },
      });
      const reservedBefore = invBefore.reserved;

      // Initiate payment
      const initRes = await paymentsService.initiatePayment(
        { orderId: order.id },
        { userId: testCustomerId },
      );

      // Callback returns fail
      const callbackResult = await paymentsService.handleSslCallback('fail', {
        tran_id: initRes.transactionId,
        error: 'Customer bank rejected transaction',
      });

      expect(callbackResult.redirectUrl).toContain('status=fail');

      // Check payment status
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { provider_transactionId: { provider: 'SSLCOMMERZ', transactionId: initRes.transactionId } },
      });
      expect(payment.status).toBe('FAILED');
      expect(payment.failureReason).toContain('Customer bank rejected transaction');

      // Check stock was released
      const invAfter = await prisma.inventory.findUniqueOrThrow({
        where: {
          variantId_warehouseId: {
            variantId: testVariantId,
            warehouseId: defaultWarehouseId,
          },
        },
      });
      expect(invAfter.reserved).toBe(reservedBefore - 3);

      // Order should remain PENDING to allow retry
      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe('PENDING');
      expect(updatedOrder.paymentStatus).toBe('PENDING');
    });

    it('Duplicate IPN Replay: does not cause multiple executions or corrupt state', async () => {
      const order = await createTestOrder(1, 1000.0);

      const initRes = await paymentsService.initiatePayment(
        { orderId: order.id },
        { userId: testCustomerId },
      );
      const transactionId = initRes.transactionId;
      const valId = `VAL-${transactionId}`;

      (mockSslGateway.verify as any).mockResolvedValue({
        isValid: true,
        status: 'VALID',
        transactionId,
        amount: 1000.0,
        currency: 'BDT',
      });

      // First IPN
      const res1 = await paymentsService.handleSslIpn({
        tran_id: transactionId,
        val_id: valId,
        verify_sign: 'sig_1',
        verify_key: 'amount,status,tran_id,val_id',
      });
      expect(res1.status).toBe('processed');

      // Second identical IPN (replay)
      const res2 = await paymentsService.handleSslIpn({
        tran_id: transactionId,
        val_id: valId,
        verify_sign: 'sig_1',
        verify_key: 'amount,status,tran_id,val_id',
      });
      expect(res2.status).toBe('already_paid_noop');

      // Third identical IPN (replay)
      const res3 = await paymentsService.handleSslIpn({
        tran_id: transactionId,
        val_id: valId,
        verify_sign: 'sig_1',
        verify_key: 'amount,status,tran_id,val_id',
      });
      expect(res3.status).toBe('already_paid_noop');

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { provider_transactionId: { provider: 'SSLCOMMERZ', transactionId } },
      });
      expect(payment.status).toBe('PAID');
    });

    it('Amount Tampering Detection: leaves order unpaid when gateway verification amount mismatches', async () => {
      const order = await createTestOrder(2, 2000.0);

      const initRes = await paymentsService.initiatePayment(
        { orderId: order.id },
        { userId: testCustomerId },
      );
      const transactionId = initRes.transactionId;

      // Gateway reports status VALID but amount is manipulated to 50 BDT instead of 2000 BDT
      (mockSslGateway.verify as any).mockResolvedValue({
        isValid: true,
        status: 'VALID',
        transactionId,
        amount: 50.0, // Fraudulent amount
        currency: 'BDT',
      });

      const callbackResult = await paymentsService.handleSslCallback('success', {
        tran_id: transactionId,
        val_id: 'VAL-TAMPERED-001',
      });

      expect(callbackResult.redirectUrl).toContain('status=failed');
      expect(callbackResult.redirectUrl).toContain('reason=verification_mismatch');

      // Verify order is NOT paid
      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe('PENDING');
      expect(updatedOrder.paymentStatus).toBe('PENDING');

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { provider_transactionId: { provider: 'SSLCOMMERZ', transactionId } },
      });
      expect(payment.status).toBe('FAILED');
      expect(payment.failureReason).toContain('Verification mismatch');
    });

    it('Admin Payment API: lists payments and supports COD collection on DELIVERED orders', async () => {
      // 1. Create a COD order
      const order = await prisma.order.create({
        data: {
          orderNumber: `DN-COD-${Date.now()}`,
          customerId: testCustomerId,
          status: 'DELIVERED', // Already delivered
          paymentStatus: 'PENDING',
          paymentMethod: 'COD',
          subtotal: 1500.0,
          grandTotal: 1500.0,
          customerSnapshot: { id: testCustomerId, name: 'COD Customer' },
          shippingAddressSnapshot: { address1: 'Mirpur', city: 'Dhaka' },
        },
      });
      createdOrderIds.push(order.id);

      const codPayment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'COD',
          status: 'PENDING',
          amount: 1500.0,
          currency: 'BDT',
          transactionId: `COD-${order.orderNumber}`,
        },
      });
      createdPaymentIds.push(codPayment.id);

      // 2. Refresh admin auth right before call
      const adminAuth = await createTestSuperAdminAuth();
      const freshAdminAuthHeader = `Bearer ${adminAuth.token}`;
      createdUserIds.push(adminAuth.userId);

      // Mark COD collected via Admin API endpoint
      const res = await request(app)
        .post(`/api/v1/admin/payments/${codPayment.id}/mark-cod-collected`)
        .set('Authorization', freshAdminAuthHeader)
        .send({ note: 'Driver handed over cash' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PAID');

      // Verify DB state
      const verifiedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(verifiedOrder.paymentStatus).toBe('PAID');

      // 3. List admin payments via API
      const listRes = await request(app)
        .get('/api/v1/admin/payments')
        .set('Authorization', freshAdminAuthHeader)
        .query({ provider: 'COD' });

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.meta.pagination.totalItems).toBeGreaterThan(0);
    });
  },
);
