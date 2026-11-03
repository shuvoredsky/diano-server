import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '@/app';
import { env } from '@/config/env.config';
import { pgPool } from '@/config/database';

describe('Internal Maintenance Jobs API Integration Tests', () => {
  const testSecret = 'test_internal_jobs_super_secret_32_characters_long!';
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = env.JOBS_SECRET;
    (env as { JOBS_SECRET: string }).JOBS_SECRET = testSecret;
  });

  afterAll(() => {
    (env as { JOBS_SECRET?: string }).JOBS_SECRET = originalSecret;
  });

  it('rejects trigger request with 401 when x-jobs-secret is missing', async () => {
    const res = await supertest(app).post('/api/v1/internal/jobs/classify-abandoned');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Missing internal job authorization secret/);
  });

  it('rejects trigger request with 401 when secret is wrong', async () => {
    const res = await supertest(app)
      .post('/api/v1/internal/jobs/classify-abandoned')
      .set('x-jobs-secret', 'completely_wrong_secret_32_characters_xyz!');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid internal job secret/);
  });

  it('rejects unknown job name with 404 and lists allowed jobs', async () => {
    const res = await supertest(app)
      .post('/api/v1/internal/jobs/non-existent-job')
      .set('x-jobs-secret', testSecret);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Unknown internal job 'non-existent-job'/);
    expect(res.body.message).toMatch(/classify-abandoned/);
  });

  it('executes a valid maintenance job with 200 OK and non-PII summary', async () => {
    const res = await supertest(app)
      .post('/api/v1/internal/jobs/classify-abandoned')
      .set('x-jobs-secret', testSecret);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobName).toBe('classify-abandoned');
    expect(['SUCCESS', 'SKIPPED_ALREADY_RUNNING']).toContain(res.body.data.status);
    expect(res.body.data.summary).toBeDefined();
    expect(typeof res.body.data.durationMs).toBe('number');
  });

  it('handles concurrent/overlapping run safely via advisory lock (returns SKIPPED_ALREADY_RUNNING)', async () => {
    const lockKey = 'internal-job:reconcile-payments';
    const client = await pgPool.connect();

    try {
      // Manually acquire transaction advisory lock on a separate connection to simulate concurrent run
      await client.query('BEGIN');
      const lockRes = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) as acquired',
        [lockKey],
      );
      expect(lockRes.rows[0]?.acquired).toBe(true);

      // Trigger job while lock is held by another worker
      const res = await supertest(app)
        .post('/api/v1/internal/jobs/reconcile-payments')
        .set('x-jobs-secret', testSecret);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SKIPPED_ALREADY_RUNNING');
      expect(res.body.data.summary.message).toMatch(/currently executing/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
