import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import { logger } from '@/utils/logger';
import { AppError } from '@/utils/app-error';
import type {
  INotificationsRepository,
} from './notifications.repository';
import { notificationsRepository } from './notifications.repository';
import type {
  IEmailAdapter,
  ISmsAdapter,
  NotificationEntity,
  NotificationPreferenceEntity,
  NotifyInput,
  UpdatePreferencesInput,
  ListNotificationsQuery,
} from './notifications.types';
import {
  createConfiguredEmailAdapter,
} from './adapters/email.adapter';
import { ConsoleSmsAdapter } from './adapters/sms.adapter';
import { InAppAdapter } from './adapters/in-app.adapter';
import { renderTemplate } from './templates';
import {
  getTemplateCategory,
  isDhakaQuietHours,
  getNextDhakaQuietHoursEnd,
  verifyUnsubscribeToken,
} from './notifications.utils';

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  dead: number;
  deferredQuietHours: number;
}

export class NotificationsService {
  constructor(
    private readonly repo: INotificationsRepository = notificationsRepository,
    private readonly emailAdapter: IEmailAdapter = createConfiguredEmailAdapter(),
    private readonly smsAdapter: ISmsAdapter = new ConsoleSmsAdapter(),
    private readonly inAppAdapter: InAppAdapter = new InAppAdapter(),
  ) {}

  /**
   * Enqueues a notification into the Postgres outbox queue.
   * Runs in the caller's transaction if provided.
   */
  async notify(input: NotifyInput, tx?: Prisma.TransactionClient): Promise<NotificationEntity | null> {
    const category = getTemplateCategory(input.template);

    // 1. Check user preferences for non-transactional messages
    if (input.userId && category !== 'TRANSACTIONAL') {
      const prefs = await this.repo.getPreferences(input.userId);
      if (input.channel === 'EMAIL' && category === 'MARKETING' && !prefs.emailMarketing) {
        logger.info({ userId: input.userId, template: input.template }, 'Notification suppressed: user opted out of marketing emails');
        return null;
      }
      if (input.channel === 'SMS' && category === 'MARKETING' && !prefs.smsMarketing) {
        logger.info({ userId: input.userId, template: input.template }, 'Notification suppressed: user opted out of marketing SMS');
        return null;
      }
      if (input.channel === 'SMS' && category === 'RECOVERY' && !prefs.smsRecovery) {
        logger.info({ userId: input.userId, template: input.template }, 'Notification suppressed: user opted out of recovery SMS');
        return null;
      }
    }

    // 2. Render Template
    const rendered = renderTemplate(input.template, input.data, input.locale || 'en', input.userId);

    // 3. Determine initial nextAttemptAt: if quiet hours for SMS marketing/recovery, defer to quiet hours end
    let nextAttemptAt = new Date();
    if (input.channel === 'SMS' && (category === 'MARKETING' || category === 'RECOVERY') && isDhakaQuietHours()) {
      nextAttemptAt = getNextDhakaQuietHoursEnd();
    }

    // 4. Save to Outbox
    const entity = await this.repo.createNotification(
      {
        userId: input.userId,
        channel: input.channel,
        recipient: input.recipient,
        template: input.template,
        subject: rendered.subject,
        content: rendered.html || rendered.text,
        metadata: {
          locale: input.locale || 'en',
          category,
          textOnly: rendered.text,
        },
        dedupeKey: input.dedupeKey,
        nextAttemptAt,
      },
      tx,
    );

    return entity;
  }

  /**
   * Safe wrapper around notify() that catches errors so failures never disrupt
   * the outer business transaction.
   */
  async safeNotify(input: NotifyInput, tx?: Prisma.TransactionClient): Promise<NotificationEntity | null> {
    try {
      return await this.notify(input, tx);
    } catch (err: unknown) {
      logger.error({ error: err instanceof Error ? err.message : String(err), template: input.template }, 'Failed to enqueue notification; suppressed to protect business transaction');
      return null;
    }
  }

  /**
   * Dispatches a notification immediately (useful for urgent OTP / auth emails)
   */
  async sendImmediate(input: NotifyInput): Promise<{ success: boolean; notificationId: string }> {
    const rendered = renderTemplate(input.template, input.data, input.locale || 'en', input.userId);

    const record = await this.repo.createNotification({
      userId: input.userId,
      channel: input.channel,
      recipient: input.recipient,
      template: input.template,
      subject: rendered.subject,
      content: rendered.html || rendered.text,
      metadata: { locale: input.locale || 'en', textOnly: rendered.text },
      dedupeKey: input.dedupeKey,
    });

    try {
      const result = await this.dispatchChannel(record, rendered.text);
      if (result.success) {
        await this.repo.updateStatus(record.id, {
          status: 'SENT',
          sentAt: new Date(),
        });
        return { success: true, notificationId: record.id };
      } else {
        await this.repo.updateStatus(record.id, {
          status: 'FAILED',
          failedAt: new Date(),
          failureReason: result.error,
          attempts: 1,
        });
        return { success: false, notificationId: record.id };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown dispatch error';
      await this.repo.updateStatus(record.id, {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: errorMsg,
        attempts: 1,
      });
      return { success: false, notificationId: record.id };
    }
  }

  /**
   * Process a batch of pending notifications from the outbox using SKIP LOCKED.
   */
  async processNotificationQueue(limit = 50, now = new Date()): Promise<ProcessQueueResult> {
    const summary: ProcessQueueResult = {
      processed: 0,
      sent: 0,
      failed: 0,
      dead: 0,
      deferredQuietHours: 0,
    };

    // 1. Atomically acquire batch with FOR UPDATE SKIP LOCKED
    const batch = await prisma.$transaction(
      async tx => {
        return this.repo.findQueueBatch(limit, now, tx);
      },
      { timeout: 25000, maxWait: 15000 },
    );

    if (batch.length === 0) {
      return summary;
    }

    summary.processed = batch.length;

    // 2. Process each notification independently
    for (const notification of batch) {
      const category = getTemplateCategory(notification.template);

      // Dhaka Quiet Hours check for SMS marketing / recovery
      if (
        notification.channel === 'SMS' &&
        (category === 'MARKETING' || category === 'RECOVERY') &&
        isDhakaQuietHours(now)
      ) {
        const deferredUntil = getNextDhakaQuietHoursEnd(now);
        await this.repo.updateStatus(notification.id, {
          status: 'PENDING',
          nextAttemptAt: deferredUntil,
        });
        summary.deferredQuietHours++;
        continue;
      }

      // Dispatch to adapter with 10s timeout
      try {
        const textOnly = (notification.metadata as Record<string, unknown>)?.textOnly as string | undefined;
        const result = await this.timeoutPromise(
          this.dispatchChannel(notification, textOnly),
          10000,
          'Dispatch timed out after 10000ms',
        );

        if (result.success) {
          await this.repo.updateStatus(notification.id, {
            status: 'SENT',
            sentAt: new Date(),
            failureReason: null,
          });
          summary.sent++;
        } else {
          await this.handleFailure(notification, result.error || 'Provider returned unsuccessful dispatch', now, summary);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unexpected dispatch error';
        await this.handleFailure(notification, errorMsg, now, summary);
      }
    }

    return summary;
  }

  private async dispatchChannel(
    notification: NotificationEntity,
    textOnly?: string,
  ): Promise<{ success: boolean; error?: string }> {
    switch (notification.channel) {
      case 'EMAIL':
        return this.emailAdapter.send({
          to: notification.recipient,
          subject: notification.subject || 'Diano Notification',
          html: notification.content,
          text: textOnly || notification.content,
        });

      case 'SMS':
        return this.smsAdapter.send({
          to: notification.recipient,
          message: textOnly || notification.content,
        });

      case 'IN_APP':
        return this.inAppAdapter.dispatch(notification);

      case 'PUSH':
        // Safe stub for future push notification
        return { success: true };

      default:
        return { success: false, error: `Unsupported notification channel: ${notification.channel}` };
    }
  }

  private async handleFailure(
    notification: NotificationEntity,
    errorMessage: string,
    now: Date,
    summary: ProcessQueueResult,
  ): Promise<void> {
    const nextAttempts = notification.attempts + 1;
    const MAX_ATTEMPTS = 5;

    if (nextAttempts >= MAX_ATTEMPTS) {
      await this.repo.updateStatus(notification.id, {
        status: 'DEAD',
        attempts: nextAttempts,
        failedAt: now,
        failureReason: errorMessage,
      });
      summary.dead++;
      logger.warn(
        { notificationId: notification.id, template: notification.template, attempts: nextAttempts, error: errorMessage },
        'Notification marked DEAD after max retries reached',
      );
    } else {
      // Exponential backoff: 2^attempts minutes (e.g., attempt 1 = 2m, attempt 2 = 4m, attempt 3 = 8m, attempt 4 = 16m)
      const backoffMs = Math.pow(2, nextAttempts) * 60 * 1000;
      const nextAttemptAt = new Date(now.getTime() + backoffMs);

      await this.repo.updateStatus(notification.id, {
        status: 'PENDING',
        attempts: nextAttempts,
        nextAttemptAt,
        failedAt: now,
        failureReason: errorMessage,
      });
      summary.failed++;
    }
  }

  /**
   * Admin manual retry for DEAD or FAILED notification
   */
  async retryNotification(id: string): Promise<NotificationEntity> {
    const existing = await this.repo.findNotificationById(id);
    if (!existing) {
      throw AppError.notFound('Notification not found');
    }

    const reset = await this.repo.updateStatus(id, {
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(),
      failureReason: null,
    });

    return reset;
  }

  async listNotifications(query: ListNotificationsQuery) {
    return this.repo.listNotifications(query);
  }

  async listUserInApp(userId: string, page = 1, limit = 20) {
    return this.repo.listUserInAppNotifications(userId, page, limit);
  }

  async markAsRead(id: string, userId: string) {
    const res = await this.repo.markAsRead(id, userId);
    if (!res) {
      throw AppError.notFound('Notification not found or access denied');
    }
    return res;
  }

  async markAllAsRead(userId: string) {
    return this.repo.markAllAsRead(userId);
  }

  async getPreferences(userId: string): Promise<NotificationPreferenceEntity> {
    return this.repo.getPreferences(userId);
  }

  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<NotificationPreferenceEntity> {
    return this.repo.updatePreferences(userId, input);
  }

  async unsubscribeByToken(token: string): Promise<{ success: boolean; message: string }> {
    const decoded = verifyUnsubscribeToken(token);
    if (!decoded) {
      throw AppError.badRequest('Invalid or expired unsubscribe token');
    }

    if (decoded.category === 'recovery') {
      await this.repo.updatePreferences(decoded.userId, { smsRecovery: false });
    } else {
      await this.repo.updatePreferences(decoded.userId, {
        emailMarketing: false,
        smsMarketing: false,
        promotionalPush: false,
      });
    }

    return {
      success: true,
      message: 'You have been successfully unsubscribed from marketing notifications.',
    };
  }

  async purgeOldNotifications(olderThanDays = 180): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    return this.repo.purgeOldNotifications(cutoff);
  }

  private timeoutPromise<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
    ]);
  }
}

export const notificationsService = new NotificationsService();

