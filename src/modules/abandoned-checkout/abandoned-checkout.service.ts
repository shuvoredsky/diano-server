import { Decimal } from 'decimal.js';
import { AppError } from '@/utils/app-error';
import { auditService, recordAuditSafe, type IAuditService, type ActorContext } from '@/services/audit.service';
import { checkoutRepository } from '@/modules/checkout/checkout.repository';
import { abandonedCheckoutRepository } from './abandoned-checkout.repository';
import { RecoveryService } from './abandoned-checkout.recovery';
import type {
  IAbandonedCheckoutRepository,
  AbandonedCheckoutFilterParams,
  AbandonedCheckoutDetailDto,
  AbandonedCheckoutStatsDto,
  NotificationChannel,
  IRecoveryService,
} from './abandoned-checkout.types';

export class AbandonedCheckoutService {
  private readonly recoverySvc: IRecoveryService;

  constructor(
    private readonly repo: IAbandonedCheckoutRepository = abandonedCheckoutRepository,
    private readonly checkoutRepo = checkoutRepository,
    private readonly auditSvc: IAuditService = auditService,
    recoverySvc?: IRecoveryService,
  ) {
    this.recoverySvc = recoverySvc ?? new RecoveryService(this.repo, this.checkoutRepo);
  }

  /**
   * Classify Inactive Sessions into ABANDONED or EXPIRED
   * Idempotent & Boundary-Safe:
   * Sessions active within 30 minutes remain ACTIVE.
   * Sessions inactive >= 30 mins become ABANDONED.
   */
  async classifyAbandonedSessions(
    now: Date = new Date(),
    inactivityMinutes = Number(process.env.ABANDONED_CHECKOUT_INACTIVITY_MINUTES) || 30,
  ): Promise<{ abandonedCount: number; expiredCount: number }> {
    const cutoffDate = new Date(now.getTime() - inactivityMinutes * 60 * 1000);

    // 1. Classify eligible active sessions into ABANDONED
    const sessionsToAbandon = await this.repo.findSessionsToClassify(cutoffDate);
    let abandonedCount = 0;

    for (const session of sessionsToAbandon) {
      await this.repo.updateSessionStatus(session.id, 'ABANDONED', now);
      await this.checkoutRepo.recordEvent({
        checkoutSessionId: session.id,
        type: 'CHECKOUT_ABANDONED',
        metadata: {
          step: 'auto_classified',
          inactivityMinutes: String(inactivityMinutes),
        },
      });
      abandonedCount++;
    }

    // 2. Classify expired sessions into EXPIRED
    const sessionsToExpire = await this.repo.findExpiredSessions(now);
    let expiredCount = 0;

    for (const session of sessionsToExpire) {
      if (session.status !== 'EXPIRED') {
        await this.repo.updateSessionStatus(session.id, 'EXPIRED');
        expiredCount++;
      }
    }

    return {
      abandonedCount,
      expiredCount,
    };
  }

  /**
   * Admin: List Filtered Abandoned Checkouts
   */
  async getAbandonedCheckouts(params: AbandonedCheckoutFilterParams) {
    const { items, total } = await this.repo.findFiltered(params);

    const mapped = items.map(session => {
      const snap = session.cartSnapshot;
      return {
        id: session.id,
        sessionId: session.sessionId,
        status: session.status,
        checkoutValue: new Decimal(session.checkoutValue).toFixed(2),
        totalItems: snap.items.length,
        customerName: snap.customerInfo?.name ?? 'Guest Visitor',
        customerPhone: snap.customerInfo?.phone ?? null,
        lastCompletedStep: session.lastCompletedStep,
        deviceCategory: session.deviceCategory,
        lastActivityAt: session.lastActivityAt.toISOString(),
        abandonedAt: session.abandonedAt?.toISOString() ?? null,
        recoveredAt: session.recoveredAt?.toISOString() ?? null,
        createdAt: session.createdAt.toISOString(),
      };
    });

    return {
      items: mapped,
      pagination: {
        page: params.page,
        limit: params.limit,
        totalItems: total,
        totalPages: Math.ceil(total / params.limit) || 1,
        hasNextPage: params.page * params.limit < total,
        hasPrevPage: params.page > 1,
      },
    };
  }

  /**
   * Admin: Get Abandoned Checkout Details with full timeline & audited customer PII access
   */
  async getAbandonedCheckoutById(
    id: string,
    actor?: ActorContext,
  ): Promise<AbandonedCheckoutDetailDto> {
    const session = await this.repo.findByIdWithTimeline(id);
    if (!session) {
      throw AppError.notFound('Abandoned checkout session not found');
    }

    // Audit Log: Record when an admin accesses customer PII
    if (actor && session.cartSnapshot.customerInfo) {
      await recordAuditSafe(
        this.auditSvc,
        actor,
        'VIEW_CUSTOMER_PII',
        'CheckoutSession',
        session.id,
        { sessionId: session.sessionId, customerPhone: session.cartSnapshot.customerInfo.phone },
      );
    }

    const snap = session.cartSnapshot;
    let abandonmentDurationMinutes: number | null = null;
    if (session.abandonedAt) {
      const endTime = session.recoveredAt ? new Date(session.recoveredAt).getTime() : Date.now();
      abandonmentDurationMinutes = Math.round(
        (endTime - new Date(session.abandonedAt).getTime()) / (60 * 1000),
      );
    }

    const attempts = await this.repo.getRecoveryAttempts(session.id);

    return {
      session: {
        id: session.id,
        sessionId: session.sessionId,
        status: session.status,
        checkoutValue: new Decimal(session.checkoutValue).toFixed(2),
        createdAt: session.createdAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        abandonedAt: session.abandonedAt?.toISOString() ?? null,
        recoveredAt: session.recoveredAt?.toISOString() ?? null,
        abandonmentDurationMinutes,
        deviceCategory: session.deviceCategory,
        browser: session.browser,
        customerInfo: snap.customerInfo
          ? {
              name: snap.customerInfo.name,
              phone: snap.customerInfo.phone,
              email: snap.customerInfo.email,
            }
          : null,
        items: snap.items,
        events: (session.events ?? []).map(e => ({
          type: e.type,
          occurredAt: e.occurredAt.toISOString(),
          metadata: e.metadata,
        })),
        recoveryAttempts: attempts.map(a => ({
          id: a.id,
          channel: a.channel,
          status: a.status,
          sentAt: a.sentAt.toISOString(),
        })),
      },
    };
  }

  /**
   * Admin: Aggregated Funnel & Abandonment Statistics (SQL Grouped)
   */
  async getStats(options: {
    fromDate?: Date;
    toDate?: Date;
    timezone?: string;
  }): Promise<AbandonedCheckoutStatsDto> {
    const now = new Date();
    const to = options.toDate ?? now;
    const from = options.fromDate ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days window
    const duration = to.getTime() - from.getTime();

    const prevTo = new Date(from.getTime());
    const prevFrom = new Date(prevTo.getTime() - duration);

    const [currentStats, prevStats] = await Promise.all([
      this.repo.getAggregatedStats(from, to),
      this.repo.getAggregatedStats(prevFrom, prevTo),
    ]);

    const calcRate = (numerator: number, denominator: number): string => {
      if (denominator <= 0) return '0.00%';
      return ((numerator / denominator) * 100).toFixed(2) + '%';
    };

    return {
      activeCount: currentStats.activeCount,
      abandonedCount: currentStats.abandonedCount,
      recoveredCount: currentStats.recoveredCount,
      convertedCount: currentStats.convertedCount,
      totalSessions: currentStats.totalCount,
      conversionRate: calcRate(currentStats.convertedCount, currentStats.totalCount),
      abandonmentRate: calcRate(currentStats.abandonedCount, currentStats.totalCount),
      recoveryRate: calcRate(currentStats.recoveredCount, currentStats.abandonedCount),
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        timezone: options.timezone ?? 'Asia/Dhaka',
      },
      previousPeriod: {
        conversionRate: calcRate(prevStats.convertedCount, prevStats.totalCount),
        abandonmentRate: calcRate(prevStats.abandonedCount, prevStats.totalCount),
      },
    };
  }

  /**
   * Admin: Manual Recovery Trigger
   */
  async triggerRecovery(
    sessionId: string,
    channel: NotificationChannel = 'SMS',
  ): Promise<{ success: boolean; attemptId: string; message: string }> {
    return this.recoverySvc.sendRecovery(sessionId, channel);
  }
}

export const abandonedCheckoutService = new AbandonedCheckoutService();
