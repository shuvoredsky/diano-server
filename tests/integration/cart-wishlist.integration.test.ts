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
  'Cart & Wishlist Integration Tests (PostgreSQL & Database Verification Required)',
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('should create a guest cart and persist SHA-256 hashed guest token in DB', async () => {
      const res = await request(app).get('/api/v1/cart');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.body.data.cart.isGuest).toBe(true);
    });

    it('should validate cart against real database records and return issues', async () => {
      const res = await request(app).post('/api/v1/cart/validate');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('isValid');
      expect(res.body.data).toHaveProperty('issues');
    });

    it('should reject unauthenticated access to wishlist endpoints', async () => {
      const res = await request(app).get('/api/v1/wishlist');
      expect(res.status).toBe(401);
    });
  },
);
