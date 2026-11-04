import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import type {
  NotificationChannel,
  NotificationEntity,
  NotificationPreferenceEntity,
  NotificationStatus,
  UpdatePreferencesInput,
  ListNotificationsQuery,
} from './notifications.types';

export interface INotificationsRepository {
  createNotification(
    data: {
      userId?: string | null;
      channel: NotificationChannel;
      recipient: string;
      template: string;
      subject?: string | null;
      content: string;
      metadata?: Record<string, unknown>;
      dedupeKey?: string;
      nextAttemptAt?: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationEntity>;

  findNotificationById(id: string): Promise<NotificationEntity | null>;

  findQueueBatch(
    limit: number,
    now: Date,
    tx: Prisma.TransactionClient,
  ): Promise<NotificationEntity[]>;

  updateStatus(
    id: string,
    data: {
      status: NotificationStatus;
      attempts?: number;
      nextAttemptAt?: Date | null;
      sentAt?: Date | null;
      failedAt?: Date | null;
      failureReason?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationEntity>;

  listNotifications(query: ListNotificationsQuery): Promise<{
    notifications: NotificationEntity[];
    total: number;
    page: number;
    limit: number;
  }>;

  listUserInAppNotifications(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{
    notifications: NotificationEntity[];
    unreadCount: number;
    total: number;
  }>;

  markAsRead(id: string, userId: string): Promise<NotificationEntity | null>;

  markAllAsRead(userId: string): Promise<number>;

  getPreferences(userId: string): Promise<NotificationPreferenceEntity>;

  updatePreferences(
    userId: string,
    data: UpdatePreferencesInput,
  ): Promise<NotificationPreferenceEntity>;

  purgeOldNotifications(olderThan: Date): Promise<number>;
}

export class NotificationsRepository implements INotificationsRepository {
  private client(tx?: Prisma.TransactionClient) {
    return tx || prisma;
  }

  async createNotification(
    data: {
      userId?: string | null;
      channel: NotificationChannel;
      recipient: string;
      template: string;
      subject?: string | null;
      content: string;
      metadata?: Record<string, unknown>;
      dedupeKey?: string;
      nextAttemptAt?: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationEntity> {
    const db = this.client(tx);

    // If dedupeKey is provided, check for existing notification first
    if (data.dedupeKey) {
      const existing = await db.notification.findUnique({
        where: { dedupeKey: data.dedupeKey },
      });
      if (existing) {
        return existing as unknown as NotificationEntity;
      }
    }

    try {
      const created = await db.notification.create({
        data: {
          userId: data.userId || null,
          channel: data.channel,
          recipient: data.recipient,
          template: data.template,
          subject: data.subject || null,
          content: data.content,
          metadata: (data.metadata || {}) as Prisma.InputJsonValue,
          dedupeKey: data.dedupeKey || null,
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: data.nextAttemptAt || new Date(),
        },
      });
      return created as unknown as NotificationEntity;
    } catch (err: unknown) {
      // Handle race condition on dedupeKey unique constraint
      if (data.dedupeKey && typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
        const existing = await db.notification.findUnique({
          where: { dedupeKey: data.dedupeKey },
        });
        if (existing) {
          return existing as unknown as NotificationEntity;
        }
      }
      throw err;
    }
  }

  async findNotificationById(id: string): Promise<NotificationEntity | null> {
    const record = await prisma.notification.findUnique({
      where: { id },
    });
    return record as unknown as NotificationEntity | null;
  }

  /**
   * Concurrently locks a batch of pending notifications using FOR UPDATE SKIP LOCKED.
   * Safe across parallel instances and pooled database connections.
   */
  async findQueueBatch(
    limit: number,
    now: Date,
    tx: Prisma.TransactionClient,
  ): Promise<NotificationEntity[]> {
    const rows = await tx.$queryRaw<NotificationEntity[]>`
      SELECT *
      FROM "Notification"
      WHERE "status" = 'PENDING'::"NotificationStatus"
        AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
      ORDER BY "nextAttemptAt" ASC NULLS FIRST, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    return rows;
  }

  async updateStatus(
    id: string,
    data: {
      status: NotificationStatus;
      attempts?: number;
      nextAttemptAt?: Date | null;
      sentAt?: Date | null;
      failedAt?: Date | null;
      failureReason?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationEntity> {
    const db = this.client(tx);
    const updated = await db.notification.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.attempts !== undefined ? { attempts: data.attempts } : {}),
        ...(data.nextAttemptAt !== undefined ? { nextAttemptAt: data.nextAttemptAt } : {}),
        ...(data.sentAt !== undefined ? { sentAt: data.sentAt } : {}),
        ...(data.failedAt !== undefined ? { failedAt: data.failedAt } : {}),
        ...(data.failureReason !== undefined ? { failureReason: data.failureReason } : {}),
      },
    });
    return updated as unknown as NotificationEntity;
  }

  async listNotifications(query: ListNotificationsQuery): Promise<{
    notifications: NotificationEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {};
    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;
    if (query.template) where.template = query.template;
    if (query.userId) where.userId = query.userId;
    if (query.recipient) {
      where.recipient = { contains: query.recipient, mode: 'insensitive' };
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      notifications: notifications as unknown as NotificationEntity[],
      total,
      page,
      limit,
    };
  }

  async listUserInAppNotifications(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    notifications: NotificationEntity[];
    unreadCount: number;
    total: number;
  }> {
    const skip = (Math.max(1, page) - 1) * limit;
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: 'IN_APP',
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          ...where,
          readAt: null,
        },
      }),
    ]);

    return {
      notifications: notifications as unknown as NotificationEntity[],
      unreadCount,
      total,
    };
  }

  async markAsRead(id: string, userId: string): Promise<NotificationEntity | null> {
    const existing = await prisma.notification.findFirst({
      where: { id, userId, channel: 'IN_APP' },
    });
    if (!existing) return null;

    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return updated as unknown as NotificationEntity;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, channel: 'IN_APP', readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async getPreferences(userId: string): Promise<NotificationPreferenceEntity> {
    let pref = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      pref = await prisma.notificationPreference.create({
        data: {
          userId,
          emailMarketing: true,
          smsMarketing: true,
          orderUpdates: true,
          promotionalPush: true,
          smsRecovery: true,
        },
      });
    }

    return pref as NotificationPreferenceEntity;
  }

  async updatePreferences(
    userId: string,
    data: UpdatePreferencesInput,
  ): Promise<NotificationPreferenceEntity> {
    // Transactional orderUpdates CANNOT be disabled
    const safeData: Prisma.NotificationPreferenceUpdateInput = {
      ...(data.emailMarketing !== undefined ? { emailMarketing: data.emailMarketing } : {}),
      ...(data.smsMarketing !== undefined ? { smsMarketing: data.smsMarketing } : {}),
      ...(data.promotionalPush !== undefined ? { promotionalPush: data.promotionalPush } : {}),
      ...(data.smsRecovery !== undefined ? { smsRecovery: data.smsRecovery } : {}),
      orderUpdates: true, // Always enforce true
    };

    const updated = await prisma.notificationPreference.upsert({
      where: { userId },
      update: safeData,
      create: {
        userId,
        emailMarketing: data.emailMarketing ?? true,
        smsMarketing: data.smsMarketing ?? true,
        promotionalPush: data.promotionalPush ?? true,
        smsRecovery: data.smsRecovery ?? true,
        orderUpdates: true,
      },
    });

    return updated as NotificationPreferenceEntity;
  }

  async purgeOldNotifications(olderThan: Date): Promise<number> {
    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: olderThan },
        status: { in: ['SENT', 'DELIVERED', 'DEAD'] },
      },
    });
    return result.count;
  }
}

export const notificationsRepository = new NotificationsRepository();

