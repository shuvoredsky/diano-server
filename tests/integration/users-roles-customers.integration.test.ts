import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';

import { createTestSuperAdminAuth } from './test-auth-helper';

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
  'Users, Roles & Customers API Integration Tests (Database Verification Required)',
  () => {
    let superAdminToken = '';

    beforeAll(async () => {
      // 1. Ensure a user permission exists in database so GET /permissions groups 'user'
      await prisma.permission.upsert({
        where: { slug: 'user:read' },
        update: {},
        create: {
          name: 'Read Users',
          slug: 'user:read',
          resource: 'user',
          action: 'read',
          description: 'Permission to read users',
        },
      });

      // 2. Setup real super-admin credentials and active session
      const auth = await createTestSuperAdminAuth();
      superAdminToken = auth.token;
    }, 30000);

    afterAll(async () => {
      await prisma.$disconnect();
    }, 30000);

    it('GET /api/v1/roles - should return seeded system roles from database', async () => {
      const response = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /api/v1/permissions - should return grouped permissions from database', async () => {
      const response = await request(app)
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
    });

    it('GET /api/v1/users - should return paginated users list from database', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /api/v1/customers - should return paginated customer accounts from database', async () => {
      const response = await request(app)
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  },
);
