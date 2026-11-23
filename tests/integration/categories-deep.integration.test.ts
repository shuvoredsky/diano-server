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
  'Unlimited Depth Category Tree Integration Tests',
  () => {
    let adminToken = '';
    const createdCategoryIds: string[] = [];

    beforeAll(async () => {
      const auth = await createTestSuperAdminAuth();
      adminToken = auth.token;
    }, 30000);

    afterAll(async () => {
      // Targeted cleanup in reverse order
      for (const id of [...createdCategoryIds].reverse()) {
        await prisma.product.deleteMany({ where: { categoryId: id } }).catch(() => {});
        await prisma.category.delete({ where: { id } }).catch(() => {});
      }
      await prisma.$disconnect();
    }, 30000);

    it('should create a 6-level deep category hierarchy successfully', async () => {
      let currentParentId: string | null = null;

      for (let level = 1; level <= 6; level++) {
        const res = await request(app)
          .post('/api/v1/categories')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: `Deep Level ${level} Test ${Date.now()}`,
            parentId: currentParentId,
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();

        createdCategoryIds.push(res.body.data.id);
        currentParentId = res.body.data.id;

        // Set specification template for this level
        await request(app)
          .patch(`/api/v1/categories/${res.body.data.id}/specification-template`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            template: [
              {
                key: `spec_level_${level}`,
                label: `Spec Level ${level}`,
                type: 'text',
                required: false,
                sortOrder: level,
              },
            ],
          });
      }

      expect(createdCategoryIds.length).toBe(6);
    }, 90000);

    it('should reject creating depth 7 category when max depth is 6', async () => {
      const level6Id = createdCategoryIds[5];

      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Deep Level 7 Rejected',
          parentId: level6Id,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Maximum category depth of 6 levels exceeded');
    });

    it('should block moving a parent category into its own descendant (cycle prevention)', async () => {
      const level1Id = createdCategoryIds[0];
      const level3Id = createdCategoryIds[2];

      const res = await request(app)
        .patch(`/api/v1/categories/${level1Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          parentId: level3Id,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('cyclic hierarchy blocked');
    });

    it('should inherit specification templates from all ancestors down to leaf', async () => {
      const leafId = createdCategoryIds[5];

      const res = await request(app)
        .get(`/api/v1/categories/${leafId}/product-form-schema`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.template.length).toBeGreaterThanOrEqual(6);
    });
  },
);

