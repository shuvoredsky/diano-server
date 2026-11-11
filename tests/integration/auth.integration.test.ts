import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { seedDatabase } from '../../prisma/seed';
import { hashPassword } from '@/utils/password.util';

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

    const testSupportStaffEmail = `support_staff_${Date.now()}@diano.com.bd`;
    const testSuperAdminEmail = `super_admin_${Date.now()}@diano.com.bd`;

    let accessToken = '';
    let refreshCookie = '';

    beforeAll(async () => {
      // Connect and ensure baseline roles/permissions are seeded in test DB
      await prisma.$connect();
      await seedDatabase();
    }, 60000);

    afterAll(async () => {
      // Cleanup created test records and disconnect
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [testCustomer.email, testSupportStaffEmail, testSuperAdminEmail],
          },
        },
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
      expect(response.body.data.permissions).toEqual([]);
      expect(response.body.data.isSuperAdmin).toBe(false);
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it('GET /api/v1/auth/me - returns effective permission slugs for support-staff and full list for super-admin', async () => {
      const passwordHash = await hashPassword(testCustomer.password);

      const supportRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'support-staff' } });
      const superRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'super-admin' } });

      const supportUser = await prisma.user.create({
        data: {
          email: testSupportStaffEmail,
          name: 'Support Staff Test',
          passwordHash,
          status: 'ACTIVE',
          roles: { create: [{ roleId: supportRole.id }] },
        },
      });

      const superUser = await prisma.user.create({
        data: {
          email: testSuperAdminEmail,
          name: 'Super Admin Test',
          passwordHash,
          status: 'ACTIVE',
          roles: { create: [{ roleId: superRole.id }] },
        },
      });

      // 1. Login as support-staff via /auth/admin/login
      const supportLogin = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({ email: supportUser.email, password: testCustomer.password })
        .expect(200);

      expect(supportLogin.body.data.user.roles).toContain('support-staff');
      expect(supportLogin.body.data.user.isSuperAdmin).toBe(false);
      expect(supportLogin.body.data.user.permissions).toContain('customer:read');
      expect(supportLogin.body.data.user.permissions).toContain('order:read');
      expect(supportLogin.body.data.user.permissions).not.toContain('customer:manage');

      const supportMe = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${supportLogin.body.data.accessToken}`)
        .expect(200);

      expect(supportMe.body.data.isSuperAdmin).toBe(false);
      expect(supportMe.body.data.permissions).toContain('customer:read');
      expect(supportMe.body.data.permissions).not.toContain('role:delete');

      // 2. Login as super-admin via /auth/admin/login
      const superLogin = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({ email: superUser.email, password: testCustomer.password })
        .expect(200);

      expect(superLogin.body.data.user.isSuperAdmin).toBe(true);
      expect(superLogin.body.data.user.permissions.length).toBeGreaterThanOrEqual(74);

      const superMe = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${superLogin.body.data.accessToken}`)
        .expect(200);

      expect(superMe.body.data.isSuperAdmin).toBe(true);
      expect(superMe.body.data.permissions).toContain('customer:read');
      expect(superMe.body.data.permissions).toContain('customer:manage');
      expect(superMe.body.data.permissions).toContain('fraud:manage');
      expect(superMe.body.data.permissions).not.toContain('fraud:rule_manage');
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
