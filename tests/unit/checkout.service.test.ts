import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import type { ICheckoutRepository, CheckoutSessionEntity } from '@/modules/checkout/checkout.types';
import { customerInfoSchema, checkoutEventSchema } from '@/modules/checkout/checkout.validation';

describe('CheckoutService (Unit Tests with Mocked Repository)', () => {
  let mockRepo: Partial<ICheckoutRepository>;
  let mockCartSvc: {
    getOrCreateCart: ReturnType<typeof vi.fn>;
    validateCart: ReturnType<typeof vi.fn>;
  };
  let mockShippingCalc: {
    calculateShipping: ReturnType<typeof vi.fn>;
  };
  let mockCouponCalc: {
    calculateDiscount: ReturnType<typeof vi.fn>;
  };
  let service: CheckoutService;

  const sampleSession: CheckoutSessionEntity = {
    id: 'cs-db-1',
    sessionId: 'session_abc123',
    userId: 'user-1',
    status: 'ACTIVE',
    checkoutValue: 2460,
    lastCompletedStep: 'initiated',
    deviceCategory: 'DESKTOP',
    browser: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    consentStatus: null,
    lastActivityAt: new Date(),
    abandonedAt: null,
    recoveredAt: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    cartSnapshot: {
      cartId: 'cart-1',
      items: [
        {
          variantId: 'var-1',
          name: 'Classic Black T-Shirt',
          sku: 'TSHIRT-BLK-M',
          price: '1200.00',
          quantity: 2,
          lineTotal: '2400.00',
          thumbnailUrl: 'https://example.com/thumb.jpg',
        },
      ],
      shippingCharge: '60.00',
      discount: '0.00',
      tax: '0.00',
      grandTotal: '2460.00',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findBySessionId: vi.fn().mockResolvedValue(sampleSession),
      findActiveByCartIdOrUserId: vi.fn().mockResolvedValue(null),
      createSession: vi.fn().mockImplementation(data =>
        Promise.resolve({
          ...sampleSession,
          id: 'cs-new',
          sessionId: data.sessionId,
          userId: data.userId ?? null,
          cartSnapshot: data.cartSnapshot,
          checkoutValue: data.checkoutValue,
          expiresAt: data.expiresAt,
        }),
      ),
      updateSession: vi.fn().mockImplementation((_id, data) =>
        Promise.resolve({
          ...sampleSession,
          ...data,
        }),
      ),
      recordEvent: vi.fn().mockResolvedValue({
        id: 'event-1',
        checkoutSessionId: 'cs-db-1',
        type: 'CHECKOUT_STARTED',
        metadata: {},
        occurredAt: new Date(),
      }),
    };

    mockCartSvc = {
      getOrCreateCart: vi.fn().mockResolvedValue({
        cart: {
          id: 'cart-1',
          items: [
            {
              id: 'ci-1',
              variantId: 'var-1',
              quantity: 2,
              priceSnapshot: 1200,
              variant: {
                id: 'var-1',
                price: 1200,
                name: 'Classic Black T-Shirt',
                sku: 'TSHIRT-BLK-M',
                product: { thumbnailUrl: null },
              },
            },
          ],
        },
      }),
      validateCart: vi.fn().mockResolvedValue({ isValid: true, issues: [] }),
    };

    mockShippingCalc = {
      calculateShipping: vi.fn().mockResolvedValue({
        shippingCharge: '60.00',
        zoneName: 'Inside Dhaka',
        methodName: 'Standard Home Delivery',
        methodCode: 'STD-DHK',
        estimatedDays: '24-48 hours',
      }),
    };

    mockCouponCalc = {
      calculateDiscount: vi.fn().mockResolvedValue({ discount: '0.00' }),
    };

    service = new CheckoutService(
      mockRepo as ICheckoutRepository,
      mockCartSvc as any,
      mockShippingCalc as any,
      mockCouponCalc as any,
    );
  });

  describe('IDOR & Security Protection', () => {
    it('throws 401 when unauthenticated customer tries to access logged-in checkout session', async () => {
      await expect(
        service.verifySessionAccess(sampleSession, undefined, undefined),
      ).rejects.toThrow('Authentication required');
    });

    it('throws 403 when another authenticated user tries to access foreign session', async () => {
      await expect(
        service.verifySessionAccess(sampleSession, 'other-user-999', undefined),
      ).rejects.toThrow('Access denied');
    });

    it('throws 403 when guest secret token is missing or invalid', async () => {
      const guestSession: CheckoutSessionEntity = {
        ...sampleSession,
        userId: null,
        cartSnapshot: {
          ...sampleSession.cartSnapshot,
          guestSecretTokenHash: service.hashSecretToken('correct-token'),
        },
      };

      // Missing token
      await expect(
        service.verifySessionAccess(guestSession, undefined, undefined),
      ).rejects.toThrow('Guest session secret token is required');

      // Invalid token
      await expect(
        service.verifySessionAccess(guestSession, undefined, 'wrong-token'),
      ).rejects.toThrow('Invalid session secret token');

      // Valid token succeeds
      await expect(
        service.verifySessionAccess(guestSession, undefined, 'correct-token'),
      ).resolves.toBeUndefined();
    });
  });

  describe('Session Expiry & Sliding Window', () => {
    it('marks expired session as EXPIRED and rejects access', async () => {
      const expiredSession: CheckoutSessionEntity = {
        ...sampleSession,
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      };

      await expect(
        service.verifySessionAccess(expiredSession, 'user-1'),
      ).rejects.toThrow('expired');

      expect(mockRepo.updateSession).toHaveBeenCalledWith(
        expiredSession.id,
        expect.objectContaining({ status: 'EXPIRED' }),
      );
    });

    it('slides expiry forward on user interaction', async () => {
      const before = Date.now();
      const res = await service.getSession('session_abc123', 'user-1');

      expect(mockRepo.updateSession).toHaveBeenCalled();
      const updateCall = (mockRepo.updateSession as any).mock.calls[0][1];
      expect(new Date(updateCall.expiresAt).getTime()).toBeGreaterThan(before);
      expect(res.totals.grandTotal).toBe('2460.00');
    });
  });

  describe('Dynamic Totals & Progressive Steps', () => {
    it('recalculates shipping charge and grand total dynamically on district change', async () => {
      mockShippingCalc.calculateShipping.mockResolvedValueOnce({
        shippingCharge: '120.00',
        zoneName: 'Outside Dhaka',
        methodName: 'Courier Delivery',
        methodCode: 'STD-OUT',
        estimatedDays: '2-4 days',
      });

      const updated = await service.updateShippingInfo(
        'session_abc123',
        {
          address: 'GEC Circle, Nasirabad',
          district: 'Chittagong',
          area: 'Nasirabad',
        },
        'user-1',
      );

      // Subtotal (2400) + Shipping (120) = 2520.00
      expect(updated.totals.shippingCharge).toBe('120.00');
      expect(updated.totals.grandTotal).toBe('2520.00');
    });

    it('validates BD phone format in customer info', () => {
      const valid = customerInfoSchema.safeParse({
        name: 'Rahim Khan',
        phone: '01712345678',
        email: 'rahim@example.com',
        consentForRecovery: true,
      });
      expect(valid.success).toBe(true);

      const invalid = customerInfoSchema.safeParse({
        name: 'Rahim Khan',
        phone: '123456', // Invalid phone
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('Event Tracking & Allowlist Telemetry', () => {
    it('rejects unallowlisted metadata or PII in client events', () => {
      const validPayload = {
        type: 'checkout_step_completed',
        metadata: {
          step: 'payment_step',
          deviceCategory: 'DESKTOP',
        },
      };
      expect(checkoutEventSchema.safeParse(validPayload).success).toBe(true);

      const piiPayload = {
        type: 'checkout_step_completed',
        metadata: {
          step: 'payment_step',
          creditCard: '4111111111111111', // Malicious PII attempt
        },
      };
      expect(checkoutEventSchema.safeParse(piiPayload).success).toBe(false);
    });

    it('records valid client event with server timestamp', async () => {
      await service.recordClientEvent(
        'session_abc123',
        {
          type: 'checkout_step_completed',
          metadata: { step: 'customer_info' },
        },
        'user-1',
      );

      expect(mockRepo.recordEvent).toHaveBeenCalledWith({
        checkoutSessionId: 'cs-db-1',
        type: 'CHECKOUT_STEP_COMPLETED',
        metadata: { step: 'customer_info' },
      });
    });
  });

  describe('Order Conversion Hook', () => {
    it('marks session as CONVERTED and records order id', async () => {
      await service.markConverted('session_abc123', 'order-999');

      expect(mockRepo.updateSession).toHaveBeenCalledWith(
        'cs-db-1',
        expect.objectContaining({
          status: 'CONVERTED',
          lastCompletedStep: 'order_placed',
        }),
      );
    });
  });
});
