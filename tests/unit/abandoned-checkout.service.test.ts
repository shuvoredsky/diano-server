import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AbandonedCheckoutService } from '@/modules/abandoned-checkout/abandoned-checkout.service';
import type {
  IAbandonedCheckoutRepository,
  RecoveryAttemptEntity,
} from '@/modules/abandoned-checkout/abandoned-checkout.types';
import type { ICheckoutRepository, CheckoutSessionEntity } from '@/modules/checkout/checkout.types';
import type { IAuditService } from '@/services/audit.service';
import { RecoveryService } from '@/modules/abandoned-checkout/abandoned-checkout.recovery';
import { prisma } from '@/config/database';

vi.mock('@/config/database', () => ({
  prisma: {
    consentRecord: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/modules/notifications/notifications.utils', () => ({
  isDhakaQuietHours: vi.fn().mockReturnValue(false),
}));

describe('AbandonedCheckoutService (Unit Tests)', () => {
  let mockRepo: {
    findSessionsToClassify: ReturnType<typeof vi.fn>;
    findExpiredSessions: ReturnType<typeof vi.fn>;
    updateSessionStatus: ReturnType<typeof vi.fn>;
    findFiltered: ReturnType<typeof vi.fn>;
    findByIdWithTimeline: ReturnType<typeof vi.fn>;
    getRecoveryAttempts: ReturnType<typeof vi.fn>;
    createRecoveryAttempt: ReturnType<typeof vi.fn>;
    getAggregatedStats: ReturnType<typeof vi.fn>;
  };
  let mockCheckoutRepo: {
    findBySessionId: ReturnType<typeof vi.fn>;
    recordEvent: ReturnType<typeof vi.fn>;
  };
  let mockAuditSvc: { record: ReturnType<typeof vi.fn> };
  let service: AbandonedCheckoutService;

  const sampleSession: CheckoutSessionEntity = {
    id: 'cs-db-1',
    sessionId: 'session_abandoned_1',
    userId: 'user-1',
    status: 'ACTIVE',
    checkoutValue: 1500,
    lastCompletedStep: 'customer_info_entered',
    deviceCategory: 'DESKTOP',
    browser: 'Chrome',
    ipAddress: '127.0.0.1',
    consentStatus: 'GRANTED',
    lastActivityAt: new Date(Date.now() - 35 * 60 * 1000), // Inactive for 35 mins
    abandonedAt: null,
    recoveredAt: null,
    expiresAt: new Date(Date.now() + 25 * 60 * 1000), // Still has TTL
    createdAt: new Date(),
    updatedAt: new Date(),
    cartSnapshot: {
      cartId: 'cart-1',
      items: [
        {
          variantId: 'var-1',
          name: 'Classic White Shirt',
          sku: 'SHIRT-WHT-M',
          price: '1500.00',
          quantity: 1,
          lineTotal: '1500.00',
          thumbnailUrl: null,
        },
      ],
      customerInfo: {
        name: 'Sadia Jahan',
        phone: '01812345678',
        email: 'sadia@example.com',
        consentForRecovery: true,
      },
      shippingCharge: '60.00',
      discount: '0.00',
      tax: '0.00',
      grandTotal: '1560.00',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findSessionsToClassify: vi.fn().mockResolvedValue([sampleSession]),
      findExpiredSessions: vi.fn().mockResolvedValue([]),
      updateSessionStatus: vi.fn().mockResolvedValue(undefined),
      findFiltered: vi.fn().mockResolvedValue({ items: [sampleSession], total: 1 }),
      findByIdWithTimeline: vi.fn().mockResolvedValue(sampleSession),
      getRecoveryAttempts: vi.fn().mockResolvedValue([]),
      createRecoveryAttempt: vi.fn().mockImplementation(data =>
        Promise.resolve({
          id: 'rec-att-1',
          checkoutSessionId: data.checkoutSessionId,
          channel: data.channel,
          status: data.status,
          sentAt: new Date(),
        }),
      ),
      getAggregatedStats: vi.fn().mockResolvedValue({
        activeCount: 10,
        abandonedCount: 30,
        recoveredCount: 6,
        convertedCount: 40,
        totalCount: 80,
      }),
    };

    mockCheckoutRepo = {
      findBySessionId: vi.fn().mockResolvedValue(sampleSession),
      recordEvent: vi.fn().mockResolvedValue({
        id: 'ev-1',
        checkoutSessionId: 'cs-db-1',
        type: 'CHECKOUT_ABANDONED',
        metadata: {},
        occurredAt: new Date(),
      }),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new AbandonedCheckoutService(
      mockRepo as unknown as IAbandonedCheckoutRepository,
      mockCheckoutRepo as unknown as ICheckoutRepository,
      mockAuditSvc as unknown as IAuditService,
    );
  });

  describe('Inactivity Classification Boundaries', () => {
    it('classifies session inactive for >= 30 minutes as ABANDONED', async () => {
      const now = new Date();
      const res = await service.classifyAbandonedSessions(now, 30);

      expect(mockRepo.updateSessionStatus).toHaveBeenCalledWith('cs-db-1', 'ABANDONED', now);
      expect(mockCheckoutRepo.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          checkoutSessionId: 'cs-db-1',
          type: 'CHECKOUT_ABANDONED',
        }),
      );
      expect(res.abandonedCount).toBe(1);
    });

    it('does not classify recently inactive session (< 30 minutes)', async () => {
      mockRepo.findSessionsToClassify.mockResolvedValueOnce([]); // Query returned 0 matching sessions

      const res = await service.classifyAbandonedSessions(new Date(), 30);
      expect(mockRepo.updateSessionStatus).not.toHaveBeenCalled();
      expect(res.abandonedCount).toBe(0);
    });

    it('idempotently avoids re-abandoning already abandoned sessions', async () => {
      // First run
      await service.classifyAbandonedSessions(new Date(), 30);

      // Second run: no active sessions meet criteria
      mockRepo.findSessionsToClassify.mockResolvedValueOnce([]);
      const secondRun = await service.classifyAbandonedSessions(new Date(), 30);

      expect(secondRun.abandonedCount).toBe(0);
    });
  });

  describe('Audited Customer PII Access', () => {
    it('records an audit log when an admin views customer PII on checkout detail', async () => {
      const actor = {
        userId: 'admin-1',
        sessionId: 'sess-admin',
        roles: ['admin'],
        ipAddress: '10.0.0.1',
      };

      await service.getAbandonedCheckoutById('session_abandoned_1', actor);

      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VIEW_CUSTOMER_PII',
          targetType: 'CheckoutSession',
          targetId: 'cs-db-1',
        }),
      );
    });
  });

  describe('Recovery Dispatch & Privacy Consent Protection', () => {
    it('blocks recovery attempt when explicit customer consent is missing', async () => {
      const recoveryService = new RecoveryService(
        mockRepo as unknown as IAbandonedCheckoutRepository,
        mockCheckoutRepo as unknown as ICheckoutRepository,
      );

      // Session without consent
      mockCheckoutRepo.findBySessionId.mockResolvedValueOnce({
        ...sampleSession,
        cartSnapshot: {
          ...sampleSession.cartSnapshot,
          customerInfo: {
            ...sampleSession.cartSnapshot.customerInfo!,
            consentForRecovery: false,
          },
        },
      });

      vi.mocked(prisma.consentRecord.findFirst).mockResolvedValueOnce(null);

      await expect(
        recoveryService.sendRecovery('session_abandoned_1', 'SMS'),
      ).rejects.toThrow('consent is missing or revoked');
    });

    it('blocks recovery if maximum attempts limit (2) is reached', async () => {
      const recoveryService = new RecoveryService(
        mockRepo as unknown as IAbandonedCheckoutRepository,
        mockCheckoutRepo as unknown as ICheckoutRepository,
      );

      vi.mocked(prisma.consentRecord.findFirst).mockResolvedValueOnce({
        id: 'consent-1',
        isGranted: true,
      } as unknown as Awaited<ReturnType<typeof prisma.consentRecord.findFirst>>);

      // 2 prior attempts
      const twoAttempts: RecoveryAttemptEntity[] = [
        { id: '1', checkoutSessionId: 'cs-db-1', channel: 'SMS', status: 'SENT', sentAt: new Date(Date.now() - 5 * 3600000) },
        { id: '2', checkoutSessionId: 'cs-db-1', channel: 'SMS', status: 'SENT', sentAt: new Date(Date.now() - 3 * 3600000) },
      ];
      mockRepo.getRecoveryAttempts.mockResolvedValueOnce(twoAttempts);

      await expect(
        recoveryService.sendRecovery('session_abandoned_1', 'SMS'),
      ).rejects.toThrow('Maximum recovery attempts (2) reached');
    });

    it('successfully dispatches recovery message when consent is verified', async () => {
      const recoveryService = new RecoveryService(
        mockRepo as unknown as IAbandonedCheckoutRepository,
        mockCheckoutRepo as unknown as ICheckoutRepository,
      );

      vi.mocked(prisma.consentRecord.findFirst).mockResolvedValueOnce({
        id: 'consent-1',
        isGranted: true,
      } as unknown as Awaited<ReturnType<typeof prisma.consentRecord.findFirst>>);

      const res = await recoveryService.sendRecovery('session_abandoned_1', 'SMS');

      expect(res.success).toBe(true);
      expect(mockRepo.createRecoveryAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'SMS',
          status: 'SENT',
        }),
      );
    });
  });

  describe('SQL-Aggregated Statistics Calculation', () => {
    it('calculates funnel conversion and abandonment rates accurately with Asia/Dhaka default', async () => {
      const stats = await service.getStats({
        fromDate: new Date('2026-10-01'),
        toDate: new Date('2026-10-31'),
      });

      // 40 converted / 80 total = 50.00%
      expect(stats.conversionRate).toBe('50.00%');
      // 30 abandoned / 80 total = 37.50%
      expect(stats.abandonmentRate).toBe('37.50%');
      // 6 recovered / 30 abandoned = 20.00%
      expect(stats.recoveryRate).toBe('20.00%');
      expect(stats.period.timezone).toBe('Asia/Dhaka');
    });
  });
});
