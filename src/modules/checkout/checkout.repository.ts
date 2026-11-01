import { prisma } from '@/config/database';
import { toNumberSafe } from '@/utils/currency.util';
import type {
  ICheckoutRepository,
  CheckoutSessionEntity,
  CheckoutEventEntity,
  CheckoutCartSnapshot,
  CheckoutStatus,
  DeviceCategory,
  CheckoutEventType,
} from './checkout.types';

export class CheckoutRepository implements ICheckoutRepository {
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

  async findBySessionId(sessionId: string): Promise<CheckoutSessionEntity | null> {
    const session = await prisma.checkoutSession.findUnique({
      where: { sessionId },
      include: {
        events: {
          orderBy: { occurredAt: 'asc' },
        },
      },
    });

    if (!session) return null;
    return this.mapSession(session as unknown as Parameters<CheckoutRepository['mapSession']>[0]);
  }

  async findActiveByCartIdOrUserId(cartId: string, userId?: string | null): Promise<CheckoutSessionEntity | null> {
    const session = await prisma.checkoutSession.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          userId ? { userId } : { id: '__NONE__' },
          {
            cartSnapshot: {
              path: ['cartId'],
              equals: cartId,
            },
          },
        ],
      },
      include: {
        events: {
          orderBy: { occurredAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) return null;
    return this.mapSession(session as unknown as Parameters<CheckoutRepository['mapSession']>[0]);
  }

  async createSession(data: {
    sessionId: string;
    userId?: string | null;
    cartSnapshot: CheckoutCartSnapshot;
    checkoutValue: number;
    expiresAt: Date;
    deviceCategory?: DeviceCategory;
    browser?: string;
    ipAddress?: string;
  }): Promise<CheckoutSessionEntity> {
    const session = await prisma.checkoutSession.create({
      data: {
        sessionId: data.sessionId,
        userId: data.userId ?? null,
        status: 'ACTIVE',
        cartSnapshot: data.cartSnapshot as any,
        checkoutValue: data.checkoutValue,
        expiresAt: data.expiresAt,
        deviceCategory: data.deviceCategory ?? 'DESKTOP',
        browser: data.browser,
        ipAddress: data.ipAddress,
        lastActivityAt: new Date(),
      },
      include: {
        events: true,
      },
    });

    return this.mapSession(session as unknown as Parameters<CheckoutRepository['mapSession']>[0]);
  }

  async updateSession(
    id: string,
    data: Partial<{
      status: CheckoutStatus;
      cartSnapshot: CheckoutCartSnapshot;
      checkoutValue: number;
      lastCompletedStep: string;
      consentStatus: string;
      lastActivityAt: Date;
      abandonedAt: Date | null;
      recoveredAt: Date | null;
      expiresAt: Date;
    }>,
  ): Promise<CheckoutSessionEntity> {
    const updated = await prisma.checkoutSession.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.cartSnapshot && { cartSnapshot: data.cartSnapshot as any }),
        ...(data.checkoutValue !== undefined && { checkoutValue: data.checkoutValue }),
        ...(data.lastCompletedStep !== undefined && { lastCompletedStep: data.lastCompletedStep }),
        ...(data.consentStatus !== undefined && { consentStatus: data.consentStatus }),
        ...(data.lastActivityAt && { lastActivityAt: data.lastActivityAt }),
        ...(data.abandonedAt !== undefined && { abandonedAt: data.abandonedAt }),
        ...(data.recoveredAt !== undefined && { recoveredAt: data.recoveredAt }),
        ...(data.expiresAt && { expiresAt: data.expiresAt }),
      },
      include: {
        events: {
          orderBy: { occurredAt: 'asc' },
        },
      },
    });

    return this.mapSession(updated as unknown as Parameters<CheckoutRepository['mapSession']>[0]);
  }

  async expireSessions(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await prisma.checkoutSession.updateMany({
      where: { id: { in: ids } },
      data: { status: 'EXPIRED' },
    });
    return res.count;
  }

  async recordEvent(data: {
    checkoutSessionId: string;
    type: CheckoutEventType;
    metadata?: Record<string, unknown>;
  }): Promise<CheckoutEventEntity> {
    const event = await prisma.checkoutEvent.create({
      data: {
        checkoutSessionId: data.checkoutSessionId,
        type: data.type,
        metadata: (data.metadata ?? {}) as any,
        occurredAt: new Date(),
      },
    });

    return {
      id: event.id,
      checkoutSessionId: event.checkoutSessionId,
      type: event.type as CheckoutEventType,
      metadata: (event.metadata as Record<string, unknown>) ?? {},
      occurredAt: event.occurredAt,
    };
  }

  async findEventsBySessionId(checkoutSessionId: string): Promise<CheckoutEventEntity[]> {
    const events = await prisma.checkoutEvent.findMany({
      where: { checkoutSessionId },
      orderBy: { occurredAt: 'asc' },
    });

    return events.map(e => ({
      id: e.id,
      checkoutSessionId: e.checkoutSessionId,
      type: e.type as CheckoutEventType,
      metadata: (e.metadata as Record<string, unknown>) ?? {},
      occurredAt: e.occurredAt,
    }));
  }
}

export const checkoutRepository = new CheckoutRepository();
