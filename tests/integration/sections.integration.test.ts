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

describe.skipIf(!isTestDbAvailable)(
  'Storefront Merchandising Sections Integration Tests',
  () => {
    let adminToken = '';
    let createdSectionId: string;
    let createdSectionSlug: string;
    let isSectionTableAvailable = true;

    beforeAll(async () => {
      try {
        await prisma.$queryRaw`SELECT 1 FROM "Section" LIMIT 1`;
      } catch {
        isSectionTableAvailable = false;
      }

      if (isSectionTableAvailable) {
        const auth = await createTestSuperAdminAuth();
        adminToken = auth.token;
      }
    }, 30000);

    afterAll(async () => {
      if (createdSectionId && isSectionTableAvailable) {
        await prisma.productSection.deleteMany({ where: { sectionId: createdSectionId } }).catch(() => {});
        await prisma.section.deleteMany({ where: { id: createdSectionId } }).catch(() => {});
      }
      await prisma.$disconnect();
    }, 30000);

    it('should create an active storefront section', async () => {
      if (!isSectionTableAvailable) return;

      createdSectionSlug = `hero-spotlight-${Date.now()}`;
      const res = await request(app)
        .post('/api/v1/admin/sections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Hero Spotlight',
          slug: createdSectionSlug,
          description: 'Top promotional products',
          displayOrder: 1,
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.slug).toBe(createdSectionSlug);

      createdSectionId = res.body.data.id;
    });

    it('should get admin sections list/tree with product count', async () => {
      if (!isSectionTableAvailable) return;

      const res = await request(app)
        .get('/api/v1/admin/sections')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should update section details', async () => {
      if (!isSectionTableAvailable) return;

      const res = await request(app)
        .patch(`/api/v1/admin/sections/${createdSectionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated description for hero spotlight',
          displayOrder: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe('Updated description for hero spotlight');
      expect(res.body.data.displayOrder).toBe(5);
    });

    it('should toggle active status of section', async () => {
      if (!isSectionTableAvailable) return;

      const res = await request(app)
        .patch(`/api/v1/admin/sections/${createdSectionId}/toggle`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      // Toggle back to active
      const res2 = await request(app)
        .patch(`/api/v1/admin/sections/${createdSectionId}/toggle`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.isActive).toBe(true);
    });

    it('should retrieve public active sections', async () => {
      if (!isSectionTableAvailable) return;

      const res = await request(app).get('/api/v1/public/sections');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should retrieve public section products by slug', async () => {
      if (!isSectionTableAvailable) return;

      const res = await request(app).get(`/api/v1/public/sections/${createdSectionSlug}/products`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  },
);

