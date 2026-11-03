import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import supertest from 'supertest';
import { app } from '@/app';
import { getAllowedOrigins, env } from '@/config/env.config';
import { LocalDiskAdapter, CloudinaryAdapter } from '@/services/storage.service';
import { checkDatabaseHealth, pgPool } from '@/config/database';
import { verifyJobsSecret } from '@/modules/internal/internal-jobs.middleware';
import { INTERNAL_JOB_NAMES } from '@/modules/internal/internal-jobs.types';

describe('Render Deploy Readiness Unit Tests', () => {
  describe('Trust Proxy & Real Client IP', () => {
    it('has trust proxy enabled (1 hop) on the Express app', () => {
      expect(app.get('trust proxy')).toBe(1);
    });

    it('extracts real client IP from X-Forwarded-For header through reverse proxy', async () => {
      const testApp = express();
      testApp.set('trust proxy', 1);
      testApp.get('/test-ip', (req: Request, res: Response) => {
        res.json({ ip: req.ip });
      });

      const response = await supertest(testApp)
        .get('/test-ip')
        .set('X-Forwarded-For', '203.0.113.195');

      expect(response.status).toBe(200);
      expect(response.body.ip).toBe('203.0.113.195');
    });
  });

  describe('CORS & Cross-Site Allowed Origins', () => {
    it('returns combined allowed origins from CORS_ORIGINS, CLIENT_URL, ADMIN_URL, and FRONTEND_URL', () => {
      const origins = getAllowedOrigins();
      expect(Array.isArray(origins)).toBe(true);
      expect(origins.length).toBeGreaterThan(0);
      expect(origins).toContain('http://localhost:3000');
    });

    it('allows CORS requests with credentials from configured origins', async () => {
      const response = await supertest(app)
        .options('/api/v1/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Lightweight Health Check (Render Liveness)', () => {
    it('GET /health returns 200 UP without touching the database', async () => {
      const response = await supertest(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('UP');
      expect(response.body.appName).toBe('diano-server');
    });

    it('GET /api/v1/health returns 200 UP with uptime and timestamp', async () => {
      const response = await supertest(app).get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('UP');
    });
  });

  describe('Production Storage Rules', () => {
    it('LocalDiskAdapter throws in production to prevent data loss on ephemeral disks', () => {
      const origEnv = env.NODE_ENV;
      try {
        (env as { NODE_ENV: string }).NODE_ENV = 'production';
        expect(() => new LocalDiskAdapter()).toThrow(/LocalDiskAdapter is disabled in production/);
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = origEnv;
      }
    });

    it('CloudinaryAdapter.upload throws 503 Service Unavailable when credentials are missing', async () => {
      const origCloud = env.CLOUDINARY_CLOUD_NAME;
      try {
        (env as { CLOUDINARY_CLOUD_NAME?: string }).CLOUDINARY_CLOUD_NAME = undefined;
        const unconfiguredAdapter = new CloudinaryAdapter();

        await expect(
          unconfiguredAdapter.upload({
            buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
          }),
        ).rejects.toThrow(/Storage service is not configured/);
      } finally {
        (env as { CLOUDINARY_CLOUD_NAME?: string }).CLOUDINARY_CLOUD_NAME = origCloud;
      }
    });
  });

  describe('Database Health Check & Cold-Start Retry', () => {
    it('retries connection when initial attempt throws before failing', async () => {
      let attempts = 0;
      const fakeClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        release: vi.fn(),
      };

      vi.spyOn(pgPool, 'connect').mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Connection timeout (Neon cold start)');
        }
        return fakeClient as unknown as Awaited<ReturnType<typeof pgPool.connect>>;
      });

      const result = await checkDatabaseHealth(1, 10);
      expect(result.isConnected).toBe(true);
      expect(attempts).toBe(2);

      vi.restoreAllMocks();
    });
  });

  describe('Internal Maintenance Jobs Middleware & Allowlist', () => {
    it('contains all 6 required job names in allowlist', () => {
      expect(INTERNAL_JOB_NAMES).toContain('classify-abandoned');
      expect(INTERNAL_JOB_NAMES).toContain('reconcile-payments');
      expect(INTERNAL_JOB_NAMES).toContain('cancel-expired-orders');
      expect(INTERNAL_JOB_NAMES).toContain('cleanup-guest-carts');
      expect(INTERNAL_JOB_NAMES).toContain('release-expired-reservations');
      expect(INTERNAL_JOB_NAMES).toContain('purge-checkout-pii');
      expect(INTERNAL_JOB_NAMES.length).toBe(6);
    });

    it('fails closed with 401 when JOBS_SECRET is unset or shorter than 32 characters', () => {
      const origSecret = env.JOBS_SECRET;
      try {
        (env as { JOBS_SECRET?: string }).JOBS_SECRET = undefined;

        const req = { headers: { 'x-jobs-secret': 'some-secret' } } as unknown as Request;
        const res = {} as Response;
        let caughtError: unknown;
        const next = (err?: unknown) => {
          caughtError = err;
        };

        verifyJobsSecret(req, res, next);
        expect(caughtError).toBeDefined();
        expect((caughtError as { statusCode: number }).statusCode).toBe(401);
      } finally {
        (env as { JOBS_SECRET?: string }).JOBS_SECRET = origSecret;
      }
    });

    it('rejects missing secret with 401', () => {
      const origSecret = env.JOBS_SECRET;
      try {
        (env as { JOBS_SECRET: string }).JOBS_SECRET = 'a'.repeat(32);

        const req = { headers: {} } as Request;
        const res = {} as Response;
        let caughtError: unknown;
        const next = (err?: unknown) => {
          caughtError = err;
        };

        verifyJobsSecret(req, res, next);
        expect(caughtError).toBeDefined();
        expect((caughtError as { statusCode: number }).statusCode).toBe(401);
      } finally {
        (env as { JOBS_SECRET?: string }).JOBS_SECRET = origSecret;
      }
    });

    it('rejects invalid or wrong length secret with 401', () => {
      const origSecret = env.JOBS_SECRET;
      try {
        (env as { JOBS_SECRET: string }).JOBS_SECRET = 'a'.repeat(32);

        const req = { headers: { 'x-jobs-secret': 'wrong_secret_at_least_32_characters_1234' } } as unknown as Request;
        const res = {} as Response;
        let caughtError: unknown;
        const next = (err?: unknown) => {
          caughtError = err;
        };

        verifyJobsSecret(req, res, next);
        expect(caughtError).toBeDefined();
        expect((caughtError as { statusCode: number }).statusCode).toBe(401);
      } finally {
        (env as { JOBS_SECRET?: string }).JOBS_SECRET = origSecret;
      }
    });

    it('passes verification when valid secret is provided via x-jobs-secret header', () => {
      const origSecret = env.JOBS_SECRET;
      try {
        const validSecret = 'valid_secret_with_at_least_32_characters_xyz!';
        (env as { JOBS_SECRET: string }).JOBS_SECRET = validSecret;

        const req = { headers: { 'x-jobs-secret': validSecret } } as unknown as Request;
        const res = {} as Response;
        let nextCalled = false;
        const next = (err?: unknown) => {
          expect(err).toBeUndefined();
          nextCalled = true;
        };

        verifyJobsSecret(req, res, next);
        expect(nextCalled).toBe(true);
      } finally {
        (env as { JOBS_SECRET?: string }).JOBS_SECRET = origSecret;
      }
    });

    it('passes verification when valid secret is provided via Authorization Bearer header', () => {
      const origSecret = env.JOBS_SECRET;
      try {
        const validSecret = 'valid_secret_with_at_least_32_characters_xyz!';
        (env as { JOBS_SECRET: string }).JOBS_SECRET = validSecret;

        const req = { headers: { authorization: `Bearer ${validSecret}` } } as unknown as Request;
        const res = {} as Response;
        let nextCalled = false;
        const next = (err?: unknown) => {
          expect(err).toBeUndefined();
          nextCalled = true;
        };

        verifyJobsSecret(req, res, next);
        expect(nextCalled).toBe(true);
      } finally {
        (env as { JOBS_SECRET?: string }).JOBS_SECRET = origSecret;
      }
    });
  });
});
