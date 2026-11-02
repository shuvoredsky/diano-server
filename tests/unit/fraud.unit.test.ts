import { describe, it, expect, vi } from 'vitest';
import {
  evaluateRepeatedCodCancellations,
  evaluateMultipleOrdersSamePhone,
  evaluateHighOrderFrequency,
  evaluateUnusualQuantityOrValue,
  evaluateRepeatedPaymentFailures,
  evaluatePreviousConfirmedFraud,
  evaluateAddressReuseAcrossAccounts,
  evaluateNewAccountHighValueCod,
  evaluateSuspiciousDevicePattern,
} from '@/modules/fraud-detection/fraud.rules';
import { FraudEngine } from '@/modules/fraud-detection/fraud.engine';
import { FraudService } from '@/modules/fraud-detection/fraud.service';
import type { FraudRuleFacts, RiskScorer } from '@/modules/fraud-detection/fraud.types';
import type { FraudRepository } from '@/modules/fraud-detection/fraud.repository';
import type { PrismaAuthRepository } from '@/modules/auth/auth.repository';
import type { IAuditService } from '@/services/audit.service';
import type { OrdersService } from '@/modules/orders/orders.service';
import type { OrderEntity } from '@/modules/orders/orders.types';

const mockBaseFacts: FraudRuleFacts = {
  orderId: 'order-1',
  orderNumber: 'DN-261102-00001',
  customerId: 'cust-1',
  phone: '01712345678',
  email: 'customer@example.com',
  grandTotal: 3500,
  paymentMethod: 'COD',
  itemCount: 2,
  maxItemPrice: 2000,
  shippingAddress: {
    address: 'House 12, Road 5, Block B, Banani',
    district: 'Dhaka',
    area: 'Banani',
  },
  ipAddress: '103.145.12.34',
  userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
  deviceCategory: 'DESKTOP',
  customerCreatedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000), // 30 days old
  isGuest: false,
  history: {
    cancelledCodCount: 0,
    ordersSamePhoneShortWindow: 1,
    orderFrequency24h: 1,
    failedPaymentAttempts24h: 0,
    previousConfirmedFraud: false,
    distinctAccountsSharingAddress: 1,
  },
};

describe('Fraud Detection Rules Unit Tests', () => {
  it('Rule 1: REPEATED_COD_CANCELLATIONS triggers when cancelled COD count >= threshold', () => {
    const factsWithCancellations = {
      ...mockBaseFacts,
      history: { ...mockBaseFacts.history, cancelledCodCount: 3 },
    };
    const resTriggered = evaluateRepeatedCodCancellations(factsWithCancellations, {
      threshold: 2,
      weight: 35,
    });
    expect(resTriggered.triggered).toBe(true);
    expect(resTriggered.points).toBe(35);
    expect(resTriggered.reason).toContain('3 COD orders were cancelled');

    const resBelow = evaluateRepeatedCodCancellations(mockBaseFacts, {
      threshold: 2,
      weight: 35,
    });
    expect(resBelow.triggered).toBe(false);
    expect(resBelow.points).toBe(0);
  });

  it('Rule 2: MULTIPLE_ORDERS_SAME_PHONE triggers on order burst from same phone', () => {
    const factsBurst = {
      ...mockBaseFacts,
      history: { ...mockBaseFacts.history, ordersSamePhoneShortWindow: 4 },
    };
    const res = evaluateMultipleOrdersSamePhone(factsBurst, { threshold: 3, weight: 30 });
    expect(res.triggered).toBe(true);
    expect(res.points).toBe(30);

    const resNormal = evaluateMultipleOrdersSamePhone(mockBaseFacts, { threshold: 3, weight: 30 });
    expect(resNormal.triggered).toBe(false);
  });

  it('Rule 3: HIGH_ORDER_FREQUENCY triggers when 24h count >= threshold', () => {
    const factsHighFreq = {
      ...mockBaseFacts,
      history: { ...mockBaseFacts.history, orderFrequency24h: 6 },
    };
    const res = evaluateHighOrderFrequency(factsHighFreq, { threshold: 5, weight: 25 });
    expect(res.triggered).toBe(true);
    expect(res.points).toBe(25);
  });

  it('Rule 4: UNUSUAL_ORDER_VALUE_OR_QUANTITY triggers when value or quantity exceeds thresholds', () => {
    const factsHighValue = { ...mockBaseFacts, grandTotal: 65000 };
    const resVal = evaluateUnusualQuantityOrValue(factsHighValue, {
      thresholdValue: 50000,
      thresholdQuantity: 15,
      weight: 25,
    });
    expect(resVal.triggered).toBe(true);
    expect(resVal.points).toBe(25);

    const factsHighQty = { ...mockBaseFacts, itemCount: 20 };
    const resQty = evaluateUnusualQuantityOrValue(factsHighQty, {
      thresholdValue: 50000,
      thresholdQuantity: 15,
      weight: 25,
    });
    expect(resQty.triggered).toBe(true);
  });

  it('Rule 5: REPEATED_PAYMENT_FAILURES triggers when failed payments >= threshold', () => {
    const factsFailed = {
      ...mockBaseFacts,
      history: { ...mockBaseFacts.history, failedPaymentAttempts24h: 4 },
    };
    const res = evaluateRepeatedPaymentFailures(factsFailed, { threshold: 3, weight: 30 });
    expect(res.triggered).toBe(true);
    expect(res.points).toBe(30);
  });

  it('Rule 6: PREVIOUS_CONFIRMED_FRAUD triggers based on admin rejection only', () => {
    const factsFraud = {
      ...mockBaseFacts,
      history: { ...mockBaseFacts.history, previousConfirmedFraud: true },
    };
    const res = evaluatePreviousConfirmedFraud(factsFraud, { weight: 50 });
    expect(res.triggered).toBe(true);
    expect(res.points).toBe(50);
  });

  it('Rule 7: ADDRESS_REUSE_ACROSS_ACCOUNTS triggers when address is shared across accounts', () => {
    const factsShared = {
      ...mockBaseFacts,
      history: { ...mockBaseFacts.history, distinctAccountsSharingAddress: 4 },
    };
    const res = evaluateAddressReuseAcrossAccounts(factsShared, { threshold: 3, weight: 30 });
    expect(res.triggered).toBe(true);
    expect(res.points).toBe(30);
  });

  it('Rule 8: NEW_ACCOUNT_HIGH_VALUE_COD triggers for guest/new account + COD + high value', () => {
    const factsNewHighCod = {
      ...mockBaseFacts,
      paymentMethod: 'COD',
      isGuest: true,
      grandTotal: 18000,
    };
    const res = evaluateNewAccountHighValueCod(factsNewHighCod, {
      codValueThreshold: 15000,
      accountAgeHours: 24,
      weight: 35,
    });
    expect(res.triggered).toBe(true);
    expect(res.points).toBe(35);

    // Online payment does not trigger rule 8
    const factsOnline = { ...factsNewHighCod, paymentMethod: 'SSLCOMMERZ' };
    const resOnline = evaluateNewAccountHighValueCod(factsOnline, { codValueThreshold: 15000 });
    expect(resOnline.triggered).toBe(false);

    // Low amount does not trigger rule 8
    const factsLowCod = { ...factsNewHighCod, grandTotal: 2500 };
    const resLow = evaluateNewAccountHighValueCod(factsLowCod, { codValueThreshold: 15000 });
    expect(resLow.triggered).toBe(false);
  });

  it('Rule 9: SUSPICIOUS_DEVICE_PATTERN is a weak signal strictly capped at 15 points and never single-handedly causes HIGH', () => {
    const factsBot = { ...mockBaseFacts, deviceCategory: 'BOT' };
    const res = evaluateSuspiciousDevicePattern(factsBot, { weight: 15 });
    expect(res.triggered).toBe(true);
    expect(res.points).toBeLessThanOrEqual(15);

    // Even if admin configures weight 80, device rule caps at 15 points
    const resCapped = evaluateSuspiciousDevicePattern(factsBot, { weight: 80 });
    expect(resCapped.points).toBe(15);
    expect(resCapped.points).toBeLessThan(30); // Strictly below LOW threshold (30) and HIGH (70)
  });
});

describe('FraudEngine Risk Scoring & Thresholds', () => {
  const engine = new FraudEngine({ lowThreshold: 30, highThreshold: 70 });

  it('correctly scores LOW risk (<30) and sets AUTO_APPROVED review status', async () => {
    const rules = [
      { key: 'SUSPICIOUS_DEVICE_PATTERN', name: 'Device Pattern', weight: 15, isEnabled: true, parameters: {} },
    ];
    const facts = { ...mockBaseFacts, deviceCategory: 'BOT' };
    const result = await engine.evaluate(facts, rules);

    expect(result.riskScore).toBe(15);
    expect(result.riskLevel).toBe('LOW');
    expect(result.reviewStatus).toBe('AUTO_APPROVED');
  });

  it('correctly scores MEDIUM risk (30-69) and sets MANUAL_REVIEW status', async () => {
    const rules = [
      { key: 'REPEATED_COD_CANCELLATIONS', name: 'COD Cancels', weight: 35, isEnabled: true, parameters: { threshold: 2 } },
    ];
    const facts = {
      ...mockBaseFacts,
      history: { ...mockBaseFacts.history, cancelledCodCount: 3 },
    };
    const result = await engine.evaluate(facts, rules);

    expect(result.riskScore).toBe(35);
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.reviewStatus).toBe('MANUAL_REVIEW');
  });

  it('correctly scores HIGH risk (>=70) and sets PENDING status', async () => {
    const rules = [
      { key: 'PREVIOUS_CONFIRMED_FRAUD', name: 'Previous Fraud', weight: 50, isEnabled: true, parameters: {} },
      { key: 'NEW_ACCOUNT_HIGH_VALUE_COD', name: 'New High COD', weight: 35, isEnabled: true, parameters: { codValueThreshold: 10000 } },
    ];
    const facts = {
      ...mockBaseFacts,
      isGuest: true,
      grandTotal: 16000,
      paymentMethod: 'COD',
      history: { ...mockBaseFacts.history, previousConfirmedFraud: true },
    };
    const result = await engine.evaluate(facts, rules);

    expect(result.riskScore).toBe(85);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.reviewStatus).toBe('PENDING');
  });

  it('strictly caps total risk score at 100 even if cumulative points exceed 100', async () => {
    const rules = [
      { key: 'PREVIOUS_CONFIRMED_FRAUD', name: 'Rule A', weight: 50, isEnabled: true, parameters: {} },
      { key: 'NEW_ACCOUNT_HIGH_VALUE_COD', name: 'Rule B', weight: 35, isEnabled: true, parameters: { codValueThreshold: 5000 } },
      { key: 'REPEATED_COD_CANCELLATIONS', name: 'Rule C', weight: 35, isEnabled: true, parameters: { threshold: 1 } },
      { key: 'UNUSUAL_ORDER_VALUE_OR_QUANTITY', name: 'Rule D', weight: 25, isEnabled: true, parameters: { thresholdValue: 1000 } },
    ];
    const facts = {
      ...mockBaseFacts,
      grandTotal: 25000,
      isGuest: true,
      history: {
        ...mockBaseFacts.history,
        previousConfirmedFraud: true,
        cancelledCodCount: 2,
      },
    };
    const result = await engine.evaluate(facts, rules);
    expect(result.riskScore).toBe(100);
  });

  it('masks raw phone and address for customer privacy in factors output', async () => {
    const facts = {
      ...mockBaseFacts,
      phone: '01812345678',
      shippingAddress: {
        address: 'House 45, Gulshan-2, Dhaka',
        district: 'Dhaka',
        area: 'Gulshan',
      },
    };
    const masked = engine.maskFacts(facts);
    expect(masked.phoneMasked).toBe('018****5678');
    expect(masked.phoneMasked).not.toContain('1234');
    expect(masked.district).toBe('Dhaka');
    expect(typeof masked.addressFingerprint).toBe('string');
  });

  it('supports extension interface RiskScorer without requiring ML/AI dependencies', async () => {
    const customEngine = new FraudEngine();
    const mockScorer: RiskScorer = {
      name: 'CustomMerchantRule',
      score: (f: FraudRuleFacts) => ({
        score: f.grandTotal > 50000 ? 20 : 0,
        factors: { merchantCheck: true },
        explanation: 'Custom merchant check triggered',
      }),
    };
    customEngine.registerScorer(mockScorer);

    const result = await customEngine.evaluate({ ...mockBaseFacts, grandTotal: 60000 }, []);
    expect(result.riskScore).toBe(20);
    expect(result.triggeredRules[0].key).toBe('EXT_CUSTOMMERCHANTRULE');
  });
});

describe('FraudService Fail-Open Policy', () => {
  it('does NOT block orders when fraud assessment encounters unexpected exception (fail-open)', async () => {
    const mockRepo = {
      gatherHistory: vi.fn().mockRejectedValue(new Error('Database network timeout')),
      saveAssessment: vi.fn().mockResolvedValue({ id: 'ass-1' }),
      listRules: vi.fn(),
    };

    const service = new FraudService(
      mockRepo as unknown as FraudRepository,
      new FraudEngine(),
      {} as unknown as PrismaAuthRepository,
      { record: vi.fn() } as unknown as IAuditService,
      {} as unknown as OrdersService,
    );

    const testOrder: OrderEntity = {
      id: 'order-err-1',
      orderNumber: 'DN-261102-00099',
      customerId: 'cust-1',
      status: 'PENDING',
      subtotal: '2000',
      discountTotal: '0',
      shippingTotal: '60',
      taxTotal: '0',
      grandTotal: '2060',
      paymentStatus: 'UNPAID',
      paymentMethod: 'COD',
      shippingAddressSnapshot: { address: 'Banani', district: 'Dhaka', area: 'Banani' },
      customerSnapshot: { id: 'cust-1', name: 'Test', phone: '01700000000', isGuest: false },
      placedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };

    await expect(service.assessOrder(testOrder)).resolves.not.toThrow();
    expect(mockRepo.saveAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-err-1',
        riskScore: 0,
        riskLevel: 'LOW',
        reviewStatus: 'AUTO_APPROVED',
        factors: expect.objectContaining({
          flag: 'assessment_failed',
        }),
      }),
    );
  });
});
