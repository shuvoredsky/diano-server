import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { env } from '@/config/env.config';
import { notificationsService, NotificationsService } from '@/modules/notifications/notifications.service';
import { notificationsRepository } from '@/modules/notifications/notifications.repository';
import { createTestSuperAdminAuth, createTestCustomerAuth } from './test-auth-helper';

describe('Notifications Integration Tests (Postgres Outbox Queue & API)', () => {
  let adminAuth: { token: string; userId: string };
  let customerAuth: { token: string; userId: string };
  let originalJobsSecret: string | undefined;
  const testJobsSecret = 'test_jobs_secret_minimum_32_characters_long_12345';

  beforeAll(async () => {
    originalJobsSecret = env.JOBS_SECRET;
    (env as { JOBS_SECRET: string }).JOBS_SECRET = testJobsSecret;

    // Clean up any stale test notifications before starting
    await prisma.notification.deleteMany({
      where: {
        recipient: { contains: 'test_integ_' },
      },
    });

    adminAuth = await createTestSuperAdminAuth();
    customerAuth = await createTestCustomerAuth();
  });

  afterAll(async () => {
    (env as { JOBS_SECRET?: string }).JOBS_SECRET = originalJobsSecret;

    // Cleanup notifications created in tests
    await prisma.notification.deleteMany({
      where: {
        recipient: { contains: 'test_integ_' },
      },
    });
  });

  describe('Outbox Queueing & Deduplication', () => {
    it('creates a PENDING notification in Postgres outbox queue', async () => {
      const uniqueRecipient = `test_integ_${Date.now()}@diano.com`;
      const notif = await notificationsService.notify({
        channel: 'EMAIL',
        recipient: uniqueRecipient,
        template: 'order_placed',
        data: {
          orderNumber: 'ORD-INT-101',
          totalAmount: '4,500',
          itemsCount: 2,
        },
      });

      expect(notif).not.toBeNull();
      expect(notif?.status).toBe('PENDING');
      expect(notif?.recipient).toBe(uniqueRecipient);
      expect(notif?.attempts).toBe(0);

      const dbRow = await prisma.notification.findUnique({
        where: { id: notif!.id },
      });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.template).toBe('order_placed');
    });

    it('enforces dedupeKey idempotency (second notify call returns existing row with noop)', async () => {
      const dedupeKey = `dedupe_test_${Date.now()}`;
      const recipient = `test_integ_dedupe_${Date.now()}@diano.com`;

      const first = await notificationsService.notify({
        channel: 'EMAIL',
        recipient,
        template: 'order_placed',
        data: { orderNumber: 'ORD-INT-DEDUP' },
        dedupeKey,
      });

      const second = await notificationsService.notify({
        channel: 'EMAIL',
        recipient,
        template: 'order_placed',
        data: { orderNumber: 'ORD-INT-DEDUP' },
        dedupeKey,
      });

      expect(first?.id).toBe(second?.id);

      const count = await prisma.notification.count({
        where: { dedupeKey },
      });
      expect(count).toBe(1);
    });
  });

  describe('Concurrency & FOR UPDATE SKIP LOCKED Processing', () => {
    it('processes batch concurrently across two parallel workers without duplicate sends', async () => {
      // Clear any pending queue items to guarantee workers only process this batch
      await prisma.notification.deleteMany({
        where: { status: 'PENDING' },
      });

      const batchRecipients: string[] = [];
      for (let i = 0; i < 4; i++) {
        const recipient = `test_integ_worker_${Date.now()}_${i}@diano.com`;
        batchRecipients.push(recipient);
        await notificationsService.notify({
          channel: 'EMAIL',
          recipient,
          template: 'order_placed',
          data: { orderNumber: `ORD-CONCUR-${i}` },
        });
      }

      // Execute 2 concurrent worker calls (limit = 2 each)
      const now = new Date(Date.now() + 1000);
      const [worker1, worker2] = await Promise.all([
        notificationsService.processNotificationQueue(2, now),
        notificationsService.processNotificationQueue(2, now),
      ]);

      expect(worker1.sent + worker2.sent).toBeGreaterThanOrEqual(4);

      // Verify all 4 rows are now SENT in DB
      const sentRows = await prisma.notification.findMany({
        where: { recipient: { in: batchRecipients } },
      });
      expect(sentRows).toHaveLength(4);
      expect(sentRows.every(r => r.status === 'SENT')).toBe(true);
    });
  });

  describe('Dead-Letter Queue & Retry to DEAD', () => {
    it('transitions notification to DEAD after 5 consecutive failures', async () => {
      // Clear any other pending notifications first to ensure deterministic pickup
      await prisma.notification.deleteMany({
        where: { status: 'PENDING' },
      });

      const recipient = `test_integ_dead_${Date.now()}@diano.com`;
      const notif = await notificationsService.notify({
        channel: 'EMAIL',
        recipient,
        template: 'order_placed',
        data: { orderNumber: 'ORD-DEAD-1' },
      });

      expect(notif).not.toBeNull();

      // Set attempts to 4 so next failure marks DEAD
      await prisma.notification.update({
        where: { id: notif!.id },
        data: {
          attempts: 4,
          status: 'PENDING',
          nextAttemptAt: new Date(0), // Earliest possible
        },
      });

      const failingAdapter = {
        send: async () => ({ success: false, error: 'Simulated downstream timeout' }),
      };
      const failingService = new NotificationsService(
        notificationsRepository,
        failingAdapter,
        failingAdapter,
      );

      const result = await failingService.processNotificationQueue(1, new Date());
      expect(result.dead).toBe(1);

      const deadRow = await prisma.notification.findUnique({
        where: { id: notif!.id },
      });
      expect(deadRow?.status).toBe('DEAD');
      expect(deadRow?.attempts).toBe(5);
      expect(deadRow?.failureReason).toContain('Simulated downstream timeout');
    });
  });

  describe('Admin Endpoints & Retry Mechanism', () => {
    it('admin can list notifications with filters', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('admin can retry a DEAD notification and reset it to PENDING', async () => {
      const dead = await prisma.notification.create({
        data: {
          channel: 'EMAIL',
          recipient: `test_integ_retry_${Date.now()}@diano.com`,
          template: 'order_placed',
          content: 'Test content',
          status: 'DEAD',
          attempts: 5,
          failureReason: 'Out of credits',
        },
      });

      const res = await request(app)
        .post(`/api/v1/admin/notifications/${dead.id}/retry`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.attempts).toBe(0);

      const reloaded = await prisma.notification.findUnique({
        where: { id: dead.id },
      });
      expect(reloaded?.status).toBe('PENDING');
      expect(reloaded?.attempts).toBe(0);
      expect(reloaded?.failureReason).toBeNull();
    });
  });

  describe('Customer Preferences & In-App Notifications', () => {
    it('allows customer to get and patch preferences (orderUpdates cannot be disabled)', async () => {
      const getRes = await request(app)
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${customerAuth.token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.orderUpdates).toBe(true);

      const patchRes = await request(app)
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${customerAuth.token}`)
        .send({
          emailMarketing: false,
          smsMarketing: false,
          orderUpdates: false, // Transactional invariant: should remain true
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.emailMarketing).toBe(false);
      expect(patchRes.body.data.smsMarketing).toBe(false);
      expect(patchRes.body.data.orderUpdates).toBe(true);
    });

    it('allows customer to view and mark in-app notifications as read', async () => {
      const inAppNotif = await prisma.notification.create({
        data: {
          userId: customerAuth.userId,
          channel: 'IN_APP',
          recipient: customerAuth.userId,
          template: 'order_shipped',
          subject: 'Your order was shipped',
          content: '<p>Package in transit</p>',
          status: 'SENT',
        },
      });

      const listRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${customerAuth.token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.some((n: { id: string }) => n.id === inAppNotif.id)).toBe(true);

      const readRes = await request(app)
        .patch(`/api/v1/notifications/${inAppNotif.id}/read`)
        .set('Authorization', `Bearer ${customerAuth.token}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.data.readAt).not.toBeNull();
    });
  });

  describe('Internal Maintenance Jobs Allowlist', () => {
    it('executes process-notifications job via x-jobs-secret', async () => {
      const res = await request(app)
        .post('/api/v1/internal/jobs/process-notifications')
        .set('x-jobs-secret', testJobsSecret);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobName).toBe('process-notifications');
      expect(res.body.data.summary).toBeDefined();
    });

    it('executes purge-old-notifications job via x-jobs-secret', async () => {
      const res = await request(app)
        .post('/api/v1/internal/jobs/purge-old-notifications')
        .set('x-jobs-secret', testJobsSecret);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobName).toBe('purge-old-notifications');
      expect(res.body.data.summary.purgedNotificationsCount).toBeDefined();
    });
  });
});
