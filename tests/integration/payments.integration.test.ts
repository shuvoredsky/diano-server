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
  { timeout: 60000 },
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
    const createdCategoryIds: string[] = [];
    const createdProductIds: string[] = [];
    const createdVariantIds: string[] = [];

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
        await prisma.orderNote.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
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
      if (createdVariantIds.length > 0) {
        await prisma.inventory.deleteMany({ where: { variantId: { in: createdVariantIds } } }).catch(() => {});
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
      if (createdCategoryIds.length > 0) {
        await prisma.category.updateMany({
          where: { id: { in: createdCategoryIds } },
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
      vi.spyOn(mockSslGateway, 'verify').mockResolvedValue({
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

      vi.spyOn(mockSslGateway, 'verify').mockResolvedValue({
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
      vi.spyOn(mockSslGateway, 'verify').mockResolvedValue({
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

    it('Payment Fail -> Retry Restock: successfully re-reserves stock when retrying after a failed attempt', async () => {
      // 1. Create product and inventory
      const cat = await prisma.category.create({
        data: { name: `RetryCat-${Date.now()}`, slug: `retry-cat-${Date.now()}`, isActive: true },
      });
      createdCategoryIds.push(cat.id);
      const prod = await prisma.product.create({
        data: {
          name: `Retry Product ${Date.now()}`,
          slug: `retry-prod-${Date.now()}`,
          description: 'Retry Product Description',
          categoryId: cat.id,
          status: 'PUBLISHED',
          inventoryType: 'READY_STOCK',
        },
      });
      createdProductIds.push(prod.id);
      const variant = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          sku: `SKU-RETRY-${Date.now()}`,
          name: 'Retry Variant',
          price: 1200.0,
          isActive: true,
        },
      });
      createdVariantIds.push(variant.id);
      await prisma.inventory.create({
        data: {
          variantId: variant.id,
          warehouseId: defaultWarehouseId,
          onHand: 10,
          reserved: 2, // Reserved by initial order placement
        },
      });

      // 2. Create order
      const order = await prisma.order.create({
        data: {
          orderNumber: `DN-RETRY-${Date.now()}`,
          customerId: testCustomerId,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: 'SSLCOMMERZ',
          subtotal: 2400.0,
          grandTotal: 2400.0,
          customerSnapshot: { id: testCustomerId, name: 'Retry User', phone: '01711111111' },
          shippingAddressSnapshot: { address1: 'Dhanmondi', city: 'Dhaka' },
          items: {
            create: [
              {
                variantId: variant.id,
                productName: prod.name,
                variantName: variant.name,
                sku: variant.sku,
                unitPrice: 1200.0,
                quantity: 2,
                lineTotal: 2400.0,
              },
            ],
          },
        },
        include: { items: true },
      });
      createdOrderIds.push(order.id);

      // 3. First payment attempt fails -> releases reserved stock
      const firstPayment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'SSLCOMMERZ',
          status: 'PENDING',
          amount: 2400.0,
          currency: 'BDT',
          transactionId: `${order.orderNumber}-P1`,
        },
      });
      createdPaymentIds.push(firstPayment.id);

      await paymentsService.handleSslCallback('fail', {
        tran_id: firstPayment.transactionId,
        error: 'Customer cancelled transaction',
      });

      // Stock reservation should now be released (reserved = 0)
      const invAfterFail = await prisma.inventory.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId: variant.id, warehouseId: defaultWarehouseId } },
      });
      expect(invAfterFail.reserved).toBe(0);

      // 4. Customer retries payment -> initiatePayment re-reserves stock
      const retryResult = await paymentsService.initiatePayment(
        { orderId: order.id },
        { userId: testCustomerId, actorType: 'USER' },
      );

      expect(retryResult.transactionId).toContain('-P2-');

      // Stock reservation should now be re-reserved (reserved = 2)
      const invAfterRetry = await prisma.inventory.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId: variant.id, warehouseId: defaultWarehouseId } },
      });
      expect(invAfterRetry.reserved).toBe(2);
    });

    it('Payment Retry: rejects retry with clear error if inventory is insufficient during retry', async () => {
      // 1. Create product and variant
      const cat = await prisma.category.create({
        data: { name: `InsuffCat-${Date.now()}`, slug: `insuff-cat-${Date.now()}`, isActive: true },
      });
      createdCategoryIds.push(cat.id);
      const prod = await prisma.product.create({
        data: {
          name: `Insuff Stock Product ${Date.now()}`,
          slug: `insuff-prod-${Date.now()}`,
          description: 'Insuff Stock Product Description',
          categoryId: cat.id,
          status: 'PUBLISHED',
          inventoryType: 'READY_STOCK',
        },
      });
      createdProductIds.push(prod.id);
      const variant = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          sku: `SKU-INSUFF-${Date.now()}`,
          name: 'Insuff Variant',
          price: 1000.0,
          isActive: true,
        },
      });
      createdVariantIds.push(variant.id);
      await prisma.inventory.create({
        data: {
          variantId: variant.id,
          warehouseId: defaultWarehouseId,
          onHand: 5,
          reserved: 0,
        },
      });

      // 2. Order for 5 units
      const order = await prisma.order.create({
        data: {
          orderNumber: `DN-INSUFF-${Date.now()}`,
          customerId: testCustomerId,
          status: 'PENDING',
          paymentStatus: 'FAILED',
          paymentMethod: 'SSLCOMMERZ',
          subtotal: 5000.0,
          grandTotal: 5000.0,
          customerSnapshot: { id: testCustomerId, name: 'Insuff User', phone: '01722222222' },
          shippingAddressSnapshot: { address1: 'Banani', city: 'Dhaka' },
          items: {
            create: [
              {
                variantId: variant.id,
                productName: prod.name,
                variantName: variant.name,
                sku: variant.sku,
                unitPrice: 1000.0,
                quantity: 5,
                lineTotal: 5000.0,
              },
            ],
          },
        },
        include: { items: true },
      });
      createdOrderIds.push(order.id);

      // Create previous failed payment
      const failedPayment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'SSLCOMMERZ',
          status: 'FAILED',
          amount: 5000.0,
          currency: 'BDT',
          transactionId: `${order.orderNumber}-P1`,
        },
      });
      createdPaymentIds.push(failedPayment.id);

      // Reduce stock so only 3 remain on hand (less than order's 5)
      await prisma.inventory.update({
        where: { variantId_warehouseId: { variantId: variant.id, warehouseId: defaultWarehouseId } },
        data: { onHand: 3 },
      });

      // 3. Attempting retry should fail cleanly with insufficient stock error
      await expect(
        paymentsService.initiatePayment(
          { orderId: order.id },
          { userId: testCustomerId, actorType: 'USER' },
        ),
      ).rejects.toThrow(/Insufficient stock to retry payment/);

      // Verify no stock was reserved
      const invCheck = await prisma.inventory.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId: variant.id, warehouseId: defaultWarehouseId } },
      });
      expect(invCheck.reserved).toBe(0);
    });

    it('Expired Orders: cancelExpiredUnpaidOrders auto-cancels order past paymentDeadline and releases stock', async () => {
      // 1. Create product and inventory with 3 reserved
      const cat = await prisma.category.create({
        data: { name: `ExpCat-${Date.now()}`, slug: `exp-cat-${Date.now()}`, isActive: true },
      });
      createdCategoryIds.push(cat.id);
      const prod = await prisma.product.create({
        data: {
          name: `Exp Product ${Date.now()}`,
          slug: `exp-prod-${Date.now()}`,
          description: 'Exp Product Description',
          categoryId: cat.id,
          status: 'PUBLISHED',
          inventoryType: 'READY_STOCK',
        },
      });
      createdProductIds.push(prod.id);
      const variant = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          sku: `SKU-EXP-${Date.now()}`,
          name: 'Exp Variant',
          price: 800.0,
          isActive: true,
        },
      });
      createdVariantIds.push(variant.id);
      await prisma.inventory.create({
        data: {
          variantId: variant.id,
          warehouseId: defaultWarehouseId,
          onHand: 10,
          reserved: 3,
        },
      });

      // 2. Order created with payment deadline 2 hours in the past
      const pastDeadline = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const order = await prisma.order.create({
        data: {
          orderNumber: `DN-EXP-${Date.now()}`,
          customerId: testCustomerId,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: 'SSLCOMMERZ',
          subtotal: 2400.0,
          grandTotal: 2400.0,
          paymentDeadline: pastDeadline,
          customerSnapshot: { id: testCustomerId, name: 'Expired User', phone: '01733333333' },
          shippingAddressSnapshot: { address1: 'Uttara', city: 'Dhaka' },
          items: {
            create: [
              {
                variantId: variant.id,
                productName: prod.name,
                variantName: variant.name,
                sku: variant.sku,
                unitPrice: 800.0,
                quantity: 3,
                lineTotal: 2400.0,
              },
            ],
          },
        },
      });
      createdOrderIds.push(order.id);

      // 3. Run auto-cancel routine
      const cancelledCount = await paymentsService.cancelExpiredUnpaidOrders(new Date());
      expect(cancelledCount).toBeGreaterThanOrEqual(1);

      // Verify order is now CANCELLED
      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe('CANCELLED');
      expect(updatedOrder.cancellationReason).toBe('Payment deadline expired');

      // Verify stock reservation was released (reserved = 0)
      const invAfterCancel = await prisma.inventory.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId: variant.id, warehouseId: defaultWarehouseId } },
      });
      expect(invAfterCancel.reserved).toBe(0);
    });

    it('Late IPN: verified PAID on CANCELLED order marks payment PAID but does NOT confirm order and adds FLAGGED note', async () => {
      // 1. Create cancelled order
      const order = await prisma.order.create({
        data: {
          orderNumber: `DN-LATE-${Date.now()}`,
          customerId: testCustomerId,
          status: 'CANCELLED',
          paymentStatus: 'FAILED',
          paymentMethod: 'SSLCOMMERZ',
          subtotal: 3000.0,
          grandTotal: 3000.0,
          cancellationReason: 'Customer manually cancelled',
          customerSnapshot: { id: testCustomerId, name: 'Late IPN User', phone: '01744444444' },
          shippingAddressSnapshot: { address1: 'Gulshan', city: 'Dhaka' },
        },
      });
      createdOrderIds.push(order.id);

      const transactionId = `TRAN-LATE-${Date.now()}`;
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'SSLCOMMERZ',
          status: 'PENDING',
          amount: 3000.0,
          currency: 'BDT',
          transactionId,
        },
      });
      createdPaymentIds.push(payment.id);

      // Mock gateway validation to succeed
      vi.spyOn(mockSslGateway, 'verify').mockResolvedValue({
        isValid: true,
        status: 'VALID',
        transactionId,
        amount: 3000.0,
        currency: 'BDT',
        bankTranId: 'BANK-LATE-123',
      });

      // 2. Handle late callback
      const callbackResult = await paymentsService.handleSslCallback('success', {
        tran_id: transactionId,
        val_id: 'VAL-LATE-123',
      });

      expect(callbackResult.redirectUrl).toContain('status=success');

      // 3. Verify Payment is marked PAID (money received)
      const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe('PAID');
      expect(updatedPayment.bankTranId).toBe('BANK-LATE-123');

      // 4. Verify Order remains CANCELLED (never auto-confirmed!)
      const verifiedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { orderNotes: true, statusHistory: true },
      });
      expect(verifiedOrder.status).toBe('CANCELLED');
      expect(verifiedOrder.paymentStatus).toBe('PAID');

      // 5. Verify FLAGGED refund-needed notes exist
      const flaggedNote = verifiedOrder.orderNotes.find(n => n.note.includes('FLAGGED'));
      expect(flaggedNote).toBeDefined();
      expect(flaggedNote?.note).toContain('Refund required');

      const flaggedHistory = verifiedOrder.statusHistory.find(h => (h.note || '').includes('FLAGGED'));
      expect(flaggedHistory).toBeDefined();
    });
  },
);
