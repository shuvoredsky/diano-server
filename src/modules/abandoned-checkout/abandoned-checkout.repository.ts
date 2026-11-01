import { prisma } from '@/config/database';
import { toNumberSafe } from '@/utils/currency.util';
import type { CheckoutSessionEntity, CheckoutCartSnapshot, CheckoutStatus, DeviceCategory, CheckoutEventType } from '@/modules/checkout/checkout.types';
import type {
  IAbandonedCheckoutRepository,
  AbandonedCheckoutFilterParams,
  RecoveryAttemptEntity,
  NotificationChannel,
} from './abandoned-checkout.types';

export class AbandonedCheckoutRepository implements IAbandonedCheckoutRepository {
  private mapSession(session: {
    id: string;
    sessionId: string;
    userId: string | null;
    status: string;
    cartSnapshot: unknown;
    checkoutValue: { toNumber(): number } | number;
    lastCompletedStep: string | null;
    deviceCategory: string;
    browser: string | null;
    ipAddress: string | null;
    consentStatus: string | null;
    lastActivityAt: Date;
    abandonedAt: Date | null;
    recoveredAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    events?: Array<{
      id: string;
      checkoutSessionId: string;
      type: string;
      metadata: unknown;
      occurredAt: Date;
    }>;
  }): CheckoutSessionEntity {
    return {
      id: session.id,
      sessionId: session.sessionId,
      userId: session.userId,
      status: session.status as CheckoutStatus,
      cartSnapshot: session.cartSnapshot as CheckoutCartSnapshot,
      checkoutValue: toNumberSafe(session.checkoutValue),
      lastCompletedStep: session.lastCompletedStep,
      deviceCategory: session.deviceCategory as DeviceCategory,
      browser: session.browser,
      ipAddress: session.ipAddress,
      consentStatus: session.consentStatus,
      lastActivityAt: session.lastActivityAt,
      abandonedAt: session.abandonedAt,
      recoveredAt: session.recoveredAt,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      events: session.events?.map(e => ({
        id: e.id,
        checkoutSessionId: e.checkoutSessionId,
        type: e.type as CheckoutEventType,
        metadata: (e.metadata as Record<string, unknown>) ?? {},
        occurredAt: e.occurredAt,
      })),
    };
  }

  async findSessionsToClassify(cutoffDate: Date): Promise<CheckoutSessionEntity[]> {
    const sessions = await prisma.checkoutSession.findMany({
      where: {
        status: 'ACTIVE',
        lastActivityAt: { lte: cutoffDate },
        expiresAt: { gt: new Date() },
      },
      include: {
        events: true,
      },
    });

    return sessions.map(s => this.mapSession(s as unknown as Parameters<AbandonedCheckoutRepository['mapSession']>[0]));
  }

  async findExpiredSessions(now: Date): Promise<CheckoutSessionEntity[]> {
    const sessions = await prisma.checkoutSession.findMany({
      where: {
        status: { in: ['ACTIVE', 'ABANDONED'] },
        expiresAt: { lte: now },
      },
    });

    return sessions.map(s => this.mapSession(s as unknown as Parameters<AbandonedCheckoutRepository['mapSession']>[0]));
  }

  async updateSessionStatus(id: string, status: string, abandonedAt?: Date): Promise<void> {
    await prisma.checkoutSession.update({
      where: { id },
      data: {
        status: status as any,
        ...(abandonedAt && { abandonedAt }),
      },
    });
  }

  async findFiltered(params: AbandonedCheckoutFilterParams): Promise<{
    items: CheckoutSessionEntity[];
    total: number;
  }> {
    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = params.fromDate;
      if (params.toDate) where.createdAt.lte = params.toDate;
    }

    if (params.minValue !== undefined || params.maxValue !== undefined) {
      where.checkoutValue = {};
      if (params.minValue !== undefined) where.checkoutValue.gte = params.minValue;
      if (params.maxValue !== undefined) where.checkoutValue.lte = params.maxValue;
    }

    const [total, sessions] = await Promise.all([
      prisma.checkoutSession.count({ where }),
      prisma.checkoutSession.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          events: true,
        },
      }),
    ]);

    return {
      items: sessions.map(s => this.mapSession(s as unknown as Parameters<AbandonedCheckoutRepository['mapSession']>[0])),
      total,
    };
  }

  async findByIdWithTimeline(id: string): Promise<CheckoutSessionEntity | null> {
    const session = await prisma.checkoutSession.findFirst({
      where: {
        OR: [{ id }, { sessionId: id }],
      },
      include: {
        events: {
          orderBy: { occurredAt: 'asc' },
        },
        recoveryAttempts: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });

    if (!session) return null;
    return this.mapSession(session as unknown as Parameters<AbandonedCheckoutRepository['mapSession']>[0]);
  }

  async getRecoveryAttempts(checkoutSessionId: string): Promise<RecoveryAttemptEntity[]> {
    const attempts = await prisma.recoveryAttempt.findMany({
      where: { checkoutSessionId },
      orderBy: { sentAt: 'asc' },
    });

    return attempts.map(a => ({
      id: a.id,
      checkoutSessionId: a.checkoutSessionId,
      channel: a.channel as NotificationChannel,
      status: a.status,
      sentAt: a.sentAt,
      consentRecordId: a.consentRecordId,
      metadata: a.metadata as Record<string, unknown> | null,
    }));
  }

  async createRecoveryAttempt(data: {
    checkoutSessionId: string;
    channel: NotificationChannel;
    consentRecordId?: string | null;
    status: string;
    metadata?: Record<string, unknown>;
  }): Promise<RecoveryAttemptEntity> {
    const created = await prisma.recoveryAttempt.create({
      data: {
        checkoutSessionId: data.checkoutSessionId,
        channel: data.channel,
        consentRecordId: data.consentRecordId ?? null,
        status: data.status,
        metadata: (data.metadata ?? {}) as any,
        sentAt: new Date(),
      },
    });

    return {
      id: created.id,
      checkoutSessionId: created.checkoutSessionId,
      channel: created.channel as NotificationChannel,
      status: created.status,
      sentAt: created.sentAt,
      consentRecordId: created.consentRecordId,
      metadata: created.metadata as Record<string, unknown> | null,
    };
  }

  async getAggregatedStats(fromDate: Date, toDate: Date): Promise<{
    activeCount: number;
    abandonedCount: number;
    recoveredCount: number;
    convertedCount: number;
    totalCount: number;
  }> {
    // Database SQL group-by aggregation (zero node-memory full loads)
    const grouped = await prisma.checkoutSession.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _count: {
        _all: true,
      },
    });

    let activeCount = 0;
    let abandonedCount = 0;
    let recoveredCount = 0;
    let convertedCount = 0;
    let totalCount = 0;

    for (const group of grouped) {
      const count = group._count._all;
      totalCount += count;
      if (group.status === 'ACTIVE') activeCount += count;
      if (group.status === 'ABANDONED') abandonedCount += count;
      if (group.status === 'RECOVERED') recoveredCount += count;
      if (group.status === 'CONVERTED') convertedCount += count;
    }

    return {
      activeCount,
      abandonedCount,
      recoveredCount,
      convertedCount,
      totalCount,
    };
  }
}

export const abandonedCheckoutRepository = new AbandonedCheckoutRepository();
