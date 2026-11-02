import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  isAllowedPaymentTransition,
  assertValidPaymentTransition,
} from '@/modules/payments/payments.state-machine';
import { redactPaymentPayload } from '@/modules/payments/payments.redact';
import { SslcommerzGateway } from '@/modules/payments/gateways/sslcommerz.gateway';
import { StubGateway } from '@/modules/payments/gateways/stub.gateway';
import { PaymentGatewayRegistry } from '@/modules/payments/gateways/gateway.registry';
import { PaymentsService } from '@/modules/payments/payments.service';
import type { PaymentsRepository } from '@/modules/payments/payments.repository';
import type { PaymentGateway, GatewayInitializeInput } from '@/modules/payments/payments.types';
import { prisma } from '@/config/database';
import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';

describe('Payments Unit Test Suite', () => {
  describe('Payment State Machine', () => {
    it('allows valid progressive transitions', () => {
      expect(isAllowedPaymentTransition('INITIATED', 'PENDING')).toBe(true);
      expect(isAllowedPaymentTransition('PENDING', 'PAID')).toBe(true);
      expect(isAllowedPaymentTransition('PENDING', 'FAILED')).toBe(true);
      expect(isAllowedPaymentTransition('PENDING', 'CANCELLED')).toBe(true);
      expect(isAllowedPaymentTransition('PENDING', 'EXPIRED')).toBe(true);
      expect(isAllowedPaymentTransition('PAID', 'REFUND_PENDING')).toBe(true);
      expect(isAllowedPaymentTransition('REFUND_PENDING', 'REFUNDED')).toBe(true);
      expect(isAllowedPaymentTransition('REFUND_PENDING', 'PARTIALLY_REFUNDED')).toBe(true);
      expect(isAllowedPaymentTransition('PARTIALLY_REFUNDED', 'REFUND_PENDING')).toBe(true);
    });

    it('allows idempotent same-state transitions', () => {
      expect(isAllowedPaymentTransition('PAID', 'PAID')).toBe(true);
      expect(isAllowedPaymentTransition('PENDING', 'PENDING')).toBe(true);
      expect(() => assertValidPaymentTransition('PAID', 'PAID')).not.toThrow();
    });

    it('strictly forbids PAID state from reverting to unpaid or failed states', () => {
      expect(() => assertValidPaymentTransition('PAID', 'PENDING')).toThrow(
        /Security violation: Paid payment cannot be reverted/,
      );
      expect(() => assertValidPaymentTransition('PAID', 'FAILED')).toThrow(
        /Security violation: Paid payment cannot be reverted/,
      );
      expect(() => assertValidPaymentTransition('PAID', 'CANCELLED')).toThrow(
        /Security violation: Paid payment cannot be reverted/,
      );
      expect(() => assertValidPaymentTransition('PAID', 'INITIATED')).toThrow(
        /Security violation: Paid payment cannot be reverted/,
      );
    });

    it('rejects invalid backward transitions', () => {
      expect(() => assertValidPaymentTransition('FAILED', 'PAID')).toThrow(
        /Invalid payment status transition/,
      );
      expect(() => assertValidPaymentTransition('CANCELLED', 'PAID')).toThrow(
        /Invalid payment status transition/,
      );
      expect(() => assertValidPaymentTransition('REFUNDED', 'PAID')).toThrow(
        /Invalid payment status transition/,
      );
    });
  });

  describe('Sensitive Payload Redaction', () => {
    it('redacts sensitive keys including store password and CVV', () => {
      const payload = {
        tran_id: 'DN-001-P1',
        amount: '1500.00',
        store_passwd: 'superSecretPassword',
        card_no: '4111111111111111',
        cvv: '123',
        pin: '9876',
        customer: {
          name: 'Rahim',
          password: 'plainPassword',
        },
      };

      const redacted = redactPaymentPayload(payload);

      expect(redacted.store_passwd).toBe('***REDACTED***');
      expect(redacted.cvv).toBe('***REDACTED***');
      expect(redacted.pin).toBe('***REDACTED***');
      expect(redacted.customer.password).toBe('***REDACTED***');
      expect(redacted.card_no).toBe('**** **** **** 1111');
      expect(redacted.tran_id).toBe('DN-001-P1');
      expect(redacted.amount).toBe('1500.00');
    });
  });

  describe('Gateway Registry & Provider Stubs', () => {
    it('returns configured gateways for enabled providers', () => {
      const registry = new PaymentGatewayRegistry();
      const sslGateway = registry.getGateway('SSLCOMMERZ');
      expect(sslGateway.provider).toBe('SSLCOMMERZ');

      const codGateway = registry.getGateway('COD');
      expect(codGateway.provider).toBe('COD');
    });

    it('throws 400 Bad Request when requesting a disabled provider', () => {
      const registry = new PaymentGatewayRegistry();
      vi.spyOn(registry, 'isProviderEnabled').mockReturnValue(false);

      expect(() => registry.getGateway('SSLCOMMERZ')).toThrow(
        /Payment provider 'SSLCOMMERZ' is currently disabled/,
      );
    });

    it('bKash and Nagad stubs throw 501 Not Implemented and never simulate fake success', async () => {
      const bkashStub = new StubGateway('BKASH');
      const nagadStub = new StubGateway('NAGAD');

      await expect(
        bkashStub.initialize({} as unknown as GatewayInitializeInput),
      ).rejects.toThrow(/is not yet implemented \(scheduled for M10b\)/);
      await expect(
        nagadStub.initialize({} as unknown as GatewayInitializeInput),
      ).rejects.toThrow(/is not yet implemented \(scheduled for M10b\)/);
    });
  });

  describe('SSLCOMMERZ Gateway Official IPN & Validation Logic', () => {
    const storeId = 'test_store_id';
    const storePasswd = 'test_store_password';
    const gateway = new SslcommerzGateway({
      storeId,
      storePasswd,
      isLive: false,
    });

    it('verifies valid IPN cryptographic MD5 signature following official doc algorithm', () => {
      const postData: Record<string, string> = {
        tran_id: 'DN-TEST-TRAN-01',
        val_id: 'VAL_TEST_123',
        amount: '1500.00',
        currency: 'BDT',
        status: 'VALID',
        bank_tran_id: 'BANK_123',
        verify_key: 'amount,bank_tran_id,currency,status,tran_id,val_id',
      };

      // Official calculation:
      // Explode verify_key by comma, add store_passwd with md5(storePasswd)
      // Sort keys alphabetically, join key=val with &, hash with MD5
      const storePasswdMd5 = crypto.createHash('md5').update(storePasswd).digest('hex');
      const keys = postData.verify_key.split(',');
      keys.push('store_passwd');

      const mapped: Record<string, string> = {};
      for (const k of keys) {
        if (k === 'store_passwd') mapped[k] = storePasswdMd5;
        else mapped[k] = String(postData[k]);
      }

      const sorted = Object.keys(mapped).sort();
      const hashStr = sorted.map(k => `${k}=${mapped[k]}`).join('&');
      const expectedSign = crypto.createHash('md5').update(hashStr).digest('hex');

      postData.verify_sign = expectedSign;

      const isAuthentic = gateway.verifyIpnSignature(postData);
      expect(isAuthentic).toBe(true);
    });

    it('rejects tampered or forged IPN signatures of same length', () => {
      const postData: Record<string, unknown> = {
        tran_id: 'DN-TEST-TRAN-01',
        val_id: 'VAL_TEST_123',
        amount: '1500.00',
        currency: 'BDT',
        status: 'VALID',
        verify_key: 'amount,currency,status,tran_id,val_id',
        verify_sign: '0123456789abcdef0123456789abcdef',
      };

      const isAuthentic = gateway.verifyIpnSignature(postData);
      expect(isAuthentic).toBe(false);
    });

    it('rejects IPN signature with mismatched length safely via timingSafeEqual length guard', () => {
      const postData: Record<string, unknown> = {
        tran_id: 'DN-TEST-TRAN-01',
        val_id: 'VAL_TEST_123',
        amount: '1500.00',
        currency: 'BDT',
        status: 'VALID',
        verify_key: 'amount,currency,status,tran_id,val_id',
        verify_sign: 'short_sig',
      };

      const isAuthentic = gateway.verifyIpnSignature(postData);
      expect(isAuthentic).toBe(false);
    });

    it('rejects IPN with missing verify_sign or verify_key', () => {
      expect(gateway.verifyIpnSignature({})).toBe(false);
      expect(gateway.verifyIpnSignature({ verify_sign: 'abc' })).toBe(false);
      expect(gateway.verifyIpnSignature({ verify_key: 'amount' })).toBe(false);
    });
  });

  describe('Payments Service Business Logic', () => {
    let mockRepo: Record<string, ReturnType<typeof vi.fn>>;
    let mockGateway: Record<string, ReturnType<typeof vi.fn>>;
    let service: PaymentsService;

    beforeEach(() => {
      mockRepo = {
        createPayment: vi.fn(),
        findById: vi.fn(),
        findByTransactionId: vi.fn(),
        findAllByOrderId: vi.fn().mockResolvedValue([]),
        updatePayment: vi.fn(),
        recordPaymentEvent: vi.fn().mockResolvedValue({ event: { id: 'evt-1' }, isDuplicate: false }),
        markPaymentPaidInTransaction: vi.fn(),
        markPaymentFailedInTransaction: vi.fn(),
        createRefund: vi.fn(),
        findPayments: vi.fn(),
      };

      mockGateway = {
        provider: 'SSLCOMMERZ',
        initialize: vi.fn().mockResolvedValue({
          gatewayUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/test12345',
          sessionKey: 'TEST_SESSION_KEY',
        }),
        verify: vi.fn(),
        handleCallback: vi.fn(),
        handleIpn: vi.fn(),
        initiateRefund: vi.fn(),
        verifyRefund: vi.fn(),
        queryTransaction: vi.fn(),
      };

      const registry = new PaymentGatewayRegistry();
      registry.registerGateway('SSLCOMMERZ', mockGateway as unknown as PaymentGateway);

      service = new PaymentsService(mockRepo as unknown as PaymentsRepository, registry);
    });

    it('rejects payment callback with unknown transaction ID without marking paid', async () => {
      mockRepo.findByTransactionId.mockResolvedValue(null);

      const res = await service.handleSslCallback('success', {
        tran_id: 'UNKNOWN_TRAN_ID',
        val_id: 'VAL_123',
      });

      expect(res.redirectUrl).toContain('status=failed');
      expect(res.redirectUrl).toContain('reason=unknown_transaction');
      expect(mockRepo.markPaymentPaidInTransaction).not.toHaveBeenCalled();
    });

    it('rejects payment if Order Validation API reports amount mismatch', async () => {
      mockRepo.findByTransactionId.mockResolvedValue({
        id: 'pay-001',
        orderId: 'ord-001',
        provider: 'SSLCOMMERZ',
        status: 'PENDING',
        amount: 2500.0,
        currency: 'BDT',
        transactionId: 'TRAN-001',
      });

      // Gateway returns manipulated amount: 100.00 instead of 2500.00
      mockGateway.verify.mockResolvedValue({
        isValid: true,
        status: 'VALID',
        transactionId: 'TRAN-001',
        amount: 100.0,
        currency: 'BDT',
      });

      const res = await service.handleSslCallback('success', {
        tran_id: 'TRAN-001',
        val_id: 'VAL-001',
      });

      expect(res.redirectUrl).toContain('status=failed');
      expect(res.redirectUrl).toContain('reason=verification_mismatch');
      expect(mockRepo.markPaymentFailedInTransaction).toHaveBeenCalled();
      expect(mockRepo.markPaymentPaidInTransaction).not.toHaveBeenCalled();
    });

    it('rejects payment if currency is not BDT', async () => {
      mockRepo.findByTransactionId.mockResolvedValue({
        id: 'pay-001',
        orderId: 'ord-001',
        provider: 'SSLCOMMERZ',
        status: 'PENDING',
        amount: 500.0,
        currency: 'BDT',
        transactionId: 'TRAN-001',
      });

      mockGateway.verify.mockResolvedValue({
        isValid: true,
        status: 'VALID',
        transactionId: 'TRAN-001',
        amount: 500.0,
        currency: 'USD', // Currency mismatch!
      });

      const res = await service.handleSslCallback('success', {
        tran_id: 'TRAN-001',
        val_id: 'VAL-001',
      });

      expect(res.redirectUrl).toContain('status=failed');
      expect(res.redirectUrl).toContain('reason=verification_mismatch');
      expect(mockRepo.markPaymentPaidInTransaction).not.toHaveBeenCalled();
    });

    it('does not trust redirect body with status VALID without val_id validation', async () => {
      mockRepo.findByTransactionId.mockResolvedValue({
        id: 'pay-001',
        orderId: 'ord-001',
        provider: 'SSLCOMMERZ',
        status: 'PENDING',
        amount: 1000.0,
        currency: 'BDT',
        transactionId: 'TRAN-001',
      });

      // Callback with fake status VALID but no val_id
      const res = await service.handleSslCallback('success', {
        tran_id: 'TRAN-001',
        status: 'VALID',
      });

      expect(res.redirectUrl).toContain('status=failed');
      expect(res.redirectUrl).toContain('reason=missing_val_id');
      expect(mockRepo.markPaymentPaidInTransaction).not.toHaveBeenCalled();
    });

    it('blocks payment initiation if order already has an active attempt in progress', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-001',
        customerId: 'user-001',
        orderNumber: 'DN-001',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        paymentMethod: 'SSLCOMMERZ',
        grandTotal: new Decimal(1200),
        customerSnapshot: {},
        shippingAddressSnapshot: {},
        items: [],
      } as unknown as Prisma.OrderGetPayload<{ include: { items: true; customer: true } }>);

      // Active attempt exists!
      mockRepo.findAllByOrderId.mockResolvedValue([
        { id: 'pay-active', status: 'PENDING', provider: 'SSLCOMMERZ' },
      ]);

      await expect(
        service.initiatePayment({ orderId: 'ord-001' }, { userId: 'user-001' }),
      ).rejects.toThrow(/A payment attempt is already active/);
    });

    it('enforces refund amount cannot exceed refundable balance', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'pay-001',
        orderId: 'ord-001',
        status: 'PAID',
        amount: 1000.0,
        refunds: [
          { status: 'COMPLETED', amount: 400.0 },
        ],
      });

      // Try refunding 700 when refundable balance is only 600
      await expect(
        service.refundPayment('pay-001', { amount: 700.0, reason: 'Too much' }, 'admin-1'),
      ).rejects.toThrow(/exceeds refundable balance/);
    });

    it('blocks marking COD payment collected if order is not DELIVERED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'pay-cod-1',
        provider: 'COD',
        status: 'PENDING',
        order: {
          id: 'ord-cod-1',
          status: 'SHIPPED', // Not delivered yet!
        },
      });

      await expect(
        service.markCodCollected('pay-cod-1', 'admin-1'),
      ).rejects.toThrow(/can only be collected after the order is DELIVERED/);
    });
  });
});
