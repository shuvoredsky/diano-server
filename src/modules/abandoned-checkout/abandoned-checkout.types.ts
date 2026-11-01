import type { CheckoutSessionEntity } from '@/modules/checkout/checkout.types';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'IN_APP' | 'PUSH';

export interface RecoveryAttemptEntity {
  id: string;
  checkoutSessionId: string;
  channel: NotificationChannel;
  status: string;
  sentAt: Date;
  consentRecordId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AbandonedCheckoutFilterParams {
  status?: string;
  fromDate?: Date;
  toDate?: Date;
  minValue?: number;
  maxValue?: number;
  page: number;
  limit: number;
}

export interface AbandonedCheckoutDetailDto {
  session: {
    id: string;
    sessionId: string;
    status: string;
    checkoutValue: string;
    createdAt: string;
    lastActivityAt: string;
    abandonedAt: string | null;
    recoveredAt: string | null;
    abandonmentDurationMinutes: number | null;
    deviceCategory: string;
    browser: string | null;
    customerInfo: {
      name: string;
      phone: string;
      email?: string;
    } | null;
    items: Array<{
      variantId: string;
      name: string;
      sku: string;
      quantity: number;
      price: string;
      lineTotal: string;
    }>;
    events: Array<{
      type: string;
      occurredAt: string;
      metadata: Record<string, unknown>;
    }>;
    recoveryAttempts: Array<{
      id: string;
      channel: string;
      status: string;
      sentAt: string;
    }>;
  };
}

export interface AbandonedCheckoutStatsDto {
  activeCount: number;
  abandonedCount: number;
  recoveredCount: number;
  convertedCount: number;
  totalSessions: number;
  conversionRate: string;
  abandonmentRate: string;
  recoveryRate: string;
  period: {
    from: string;
    to: string;
    timezone: string;
  };
  previousPeriod: {
    conversionRate: string;
    abandonmentRate: string;
  };
}

export interface IRecoveryAdapter {
  send(recipient: string, message: string, channel: NotificationChannel): Promise<{ success: boolean; messageId: string }>;
}

export interface IRecoveryService {
  sendRecovery(
    sessionId: string,
    channel?: NotificationChannel,
  ): Promise<{ success: boolean; attemptId: string; message: string }>;
}

export interface IAbandonedCheckoutRepository {
  findSessionsToClassify(cutoffDate: Date): Promise<CheckoutSessionEntity[]>;
  findExpiredSessions(now: Date): Promise<CheckoutSessionEntity[]>;
  updateSessionStatus(id: string, status: string, abandonedAt?: Date): Promise<void>;
  findFiltered(params: AbandonedCheckoutFilterParams): Promise<{
    items: CheckoutSessionEntity[];
    total: number;
  }>;
  findByIdWithTimeline(id: string): Promise<CheckoutSessionEntity | null>;
  getRecoveryAttempts(checkoutSessionId: string): Promise<RecoveryAttemptEntity[]>;
  createRecoveryAttempt(data: {
    checkoutSessionId: string;
    channel: NotificationChannel;
    consentRecordId?: string | null;
    status: string;
    metadata?: Record<string, unknown>;
  }): Promise<RecoveryAttemptEntity>;
  getAggregatedStats(fromDate: Date, toDate: Date): Promise<{
    activeCount: number;
    abandonedCount: number;
    recoveredCount: number;
    convertedCount: number;
    totalCount: number;
  }>;
}
