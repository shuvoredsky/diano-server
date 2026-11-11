import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/config/database';
import { seedDatabase } from '../../prisma/seed';

describe('Database Seed Idempotency Integration Test', () => {
  afterAll(async () => {
    // Keep connection alive for other tests, no teardown needed as seed data is baseline
  });

  it('runs seedDatabase and verifies all required permissions exist', async () => {
    await expect(seedDatabase()).resolves.not.toThrow();

    const expectedSlugs = [
      'customer:read',
      'customer:manage',
      'notification:manage',
      'fraud:read',
      'fraud:review',
      'fraud:manage',
      'shipping:read',
      'shipping:dispatch',
      'shipping:manage',
      'coupon:read',
      'coupon:manage',
      'return:read',
      'return:approve',
      'return:inspect',
      'return:manage',
      'refund:read',
      'refund:approve',
      'refund:manage',
    ];

    const permissions = await prisma.permission.findMany({
      where: { slug: { in: expectedSlugs } },
    });

    const foundSlugs = permissions.map(p => p.slug);
    for (const slug of expectedSlugs) {
      expect(foundSlugs).toContain(slug);
    }

    const legacyFraudPerm = await prisma.permission.findUnique({
      where: { slug: 'fraud:rule_manage' },
    });
    expect(legacyFraudPerm).toBeNull();
  }, 60000);

  it('is idempotent: running seedDatabase a second time succeeds without errors', async () => {
    await expect(seedDatabase()).resolves.not.toThrow();
  }, 60000);
});
