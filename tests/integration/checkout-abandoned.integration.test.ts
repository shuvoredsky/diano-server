import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';

const isTestDbAvailable = Boolean(
  process.env.TEST_DATABASE_URL &&
    process.env.DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL,
);

if (
  process.env.TEST_DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
) {
  throw new Error(
    'CRITICAL SAFETY REFUSAL: TEST_DATABASE_URL is identical to DATABASE_URL! Production/Main database could be wiped.',
  );
}

describe.skipIf(!isTestDbAvailable)(
  'Checkout & Abandoned Checkout Integration Tests (Database Verification Required)',
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('should reject guest checkout access without secret token in real DB session', async () => {
      const res = await request(app).get('/api/v1/checkout/sessions/non-existent-session');
      expect([401, 403, 404]).toContain(res.status);
    });

    it('should reject unauthenticated access to admin abandoned checkouts endpoint', async () => {
      const res = await request(app).get('/api/v1/abandoned-checkouts');
      expect(res.status).toBe(401);
    });
  },
);
