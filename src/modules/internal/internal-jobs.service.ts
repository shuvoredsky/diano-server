import { pgPool } from '@/config/database';
import { logger } from '@/utils/logger';
import { auditService, type IAuditService } from '@/services/audit.service';
import { abandonedCheckoutService } from '@/modules/abandoned-checkout/abandoned-checkout.service';
import { paymentsService } from '@/modules/payments/payments.service';
import { cartService } from '@/modules/cart/cart.service';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { checkoutService } from '@/modules/checkout/checkout.service';
import { notificationsService } from '@/modules/notifications/notifications.service';
import type { InternalJobName, JobExecutionResult } from './internal-jobs.types';

export class InternalJobsService {
  constructor(private readonly audit: IAuditService = auditService) {}

  /**
   * Dispatches the underlying business logic for the specified job
   */
  private async dispatchJob(jobName: InternalJobName): Promise<Record<string, unknown>> {
    switch (jobName) {
      case 'classify-abandoned': {
        const result = await abandonedCheckoutService.classifyAbandonedSessions();
        return { abandonedCount: result.abandonedCount, expiredCount: result.expiredCount };
      }
      case 'reconcile-payments': {
        const result = await paymentsService.reconcilePendingPayments();
        return { reconciled: result.reconciled, failed: result.failed };
      }
      case 'cancel-expired-orders': {
        const count = await paymentsService.cancelExpiredUnpaidOrders();
        return { cancelledCount: count };
      }
      case 'cleanup-guest-carts': {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
        const result = await cartService.cleanupExpiredGuestCarts(cutoff);
        return { deletedCartsCount: result.count };
      }
      case 'release-expired-reservations': {
        const result = await inventoryService.releaseExpiredReservations(new Date());
        return { releasedReservationsCount: result.releasedCount };
      }
      case 'purge-checkout-pii': {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
        const count = await checkoutService.purgeExpiredCheckoutPii(cutoff);
        return { purgedSessionsCount: count };
      }
      case 'process-notifications': {
        const result = await notificationsService.processNotificationQueue();
        return {
          processed: result.processed,
          sent: result.sent,
          failed: result.failed,
          dead: result.dead,
          deferredQuietHours: result.deferredQuietHours,
        };
      }
      case 'purge-old-notifications': {
        const count = await notificationsService.purgeOldNotifications(180);
        return { purgedNotificationsCount: count };
      }
    }
  }

  private readonly runningJobs = new Set<string>();

  /**
   * Executes a maintenance job guarded by a PostgreSQL transaction advisory lock
   * and in-memory process guard.
   * Guarantees idempotency and prevents concurrent overlapping executions across
   * both local processes and pooled database connections (compatible with Neon PgBouncer).
   */
  async executeJob(jobName: InternalJobName): Promise<JobExecutionResult> {
    // 1. Process-level guard
    if (this.runningJobs.has(jobName)) {
      logger.warn({ jobName }, 'Job execution skipped: already running in current process');
      return {
        jobName,
        status: 'SKIPPED_ALREADY_RUNNING',
        summary: { message: `Job '${jobName}' is currently executing` },
        durationMs: 0,
        executedAt: new Date().toISOString(),
      };
    }

    const lockKey = `internal-job:${jobName}`;
    let client;
    let lockAcquired: boolean;

    try {
      client = await pgPool.connect();
      await client.query('BEGIN');
      const lockQuery = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) as acquired',
        [lockKey],
      );
      lockAcquired = Boolean(lockQuery.rows[0]?.acquired);
    } catch (connErr) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore rollback error
        }
        client.release();
      }
      logger.error({ jobName, connErr }, 'Failed to acquire database connection for advisory lock');
      throw connErr;
    }

    if (!lockAcquired) {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      logger.warn({ jobName }, 'Job execution skipped: another instance is currently running');
      return {
        jobName,
        status: 'SKIPPED_ALREADY_RUNNING',
        summary: { message: `Job '${jobName}' is currently executing on another worker` },
        durationMs: 0,
        executedAt: new Date().toISOString(),
      };
    }

    this.runningJobs.add(jobName);
    const startTime = Date.now();

    try {
      logger.info({ jobName }, 'Starting internal maintenance job execution');
      const summary = await this.dispatchJob(jobName);
      const durationMs = Date.now() - startTime;

      await this.audit.record({
        actorType: 'SYSTEM',
        action: `INTERNAL_JOB:${jobName}`,
        targetType: 'INTERNAL_JOB',
        targetId: jobName,
        metadata: {
          status: 'SUCCESS',
          durationMs,
          ...summary,
        },
      });

      logger.info({ jobName, durationMs, summary }, 'Internal maintenance job completed successfully');

      await client.query('COMMIT');

      return {
        jobName,
        status: 'SUCCESS',
        summary,
        durationMs,
        executedAt: new Date().toISOString(),
      };
    } catch (execErr: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = execErr instanceof Error ? execErr.message : String(execErr);

      await this.audit.record({
        actorType: 'SYSTEM',
        action: `INTERNAL_JOB_FAILED:${jobName}`,
        targetType: 'INTERNAL_JOB',
        targetId: jobName,
        metadata: {
          status: 'FAILED',
          durationMs,
          error: errorMsg,
        },
      });

      logger.error({ jobName, durationMs, error: errorMsg }, 'Internal maintenance job execution failed');

      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback error
      }

      throw execErr;
    } finally {
      this.runningJobs.delete(jobName);
      client.release();
    }
  }
}

export const internalJobsService = new InternalJobsService();
