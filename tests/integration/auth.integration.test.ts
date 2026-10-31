import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';

const isTestDbAvailable = Boolean(
  process.env.TEST_DATABASE_URL &&
    process.env.DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL,
);

// Safety protection: Never execute tests against primary DATABASE_URL
if (
  process.env.TEST_DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
) {
  throw new Error(
    'CRITICAL SAFETY REFUSAL: TEST_DATABASE_URL is identical to DATABASE_URL! Production/Main database could be wiped.',
  );
}

describe.skipIf(!isTestDbAvailable)(
  'Auth API Integration Tests (Database Verification Required)',
  () => {
    const testCustomer = {
      email: `integration_test_${Date.now()}@example.com`,
      password: 'StrongPassword123!',
      name: 'Integration Test User',
      phone: '+8801700000000',
    };

    let accessToken = '';
    let refreshCookie = '';

    beforeAll(async () => {
      // Connect and cleanup previous test runs if test DB is configured
      await prisma.$connect();
    });

    afterAll(async () => {
      // Cleanup created test records and disconnect
      await prisma.user.deleteMany({
        where: { email: testCustomer.email },
      });
      await prisma.$disconnect();
    });

    it('POST /api/v1/auth/register - should create user and set refresh cookie', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testCustomer)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testCustomer.email.toLowerCase());
      expect(response.body.data.accessToken).toBeDefined();

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
      expect(cookieStr).toContain('diano_refresh_token');
    });

    it('POST /api/v1/auth/login - should authenticate and return tokens', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testCustomer.email,
          password: testCustomer.password,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      accessToken = response.body.data.accessToken;

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      refreshCookie = Array.isArray(cookies)
        ? cookies.find(c => c.includes('diano_refresh_token')) ?? ''
        : (cookies as string);
    });

    it('GET /api/v1/auth/me - should retrieve current profile with access token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(testCustomer.email.toLowerCase());
      expect(response.body.data.roles).toContain('customer');
    });

    it('POST /api/v1/auth/refresh - should rotate refresh token and issue new access token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [refreshCookie])
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      accessToken = response.body.data.accessToken;
    });

    it('POST /api/v1/auth/logout - should revoke refresh token and clear cookie', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', [refreshCookie])
        .expect(200);

      expect(response.body.success).toBe(true);
      const cookies = response.headers['set-cookie'];
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : (cookies ?? '');
      expect(cookieStr).toContain('diano_refresh_token=;');
    });
  },
);
