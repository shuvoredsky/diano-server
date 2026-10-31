import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';

const isTestDbAvailable = Boolean(
  process.env.TEST_DATABASE_URL &&
    process.env.DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL,
);

// Safety protection: Refuse if test DB equals primary DB
if (
  process.env.TEST_DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
) {
  throw new Error(
    'CRITICAL SAFETY REFUSAL: TEST_DATABASE_URL is identical to DATABASE_URL! Production/Main database could be wiped.',
  );
}

describe.skipIf(!isTestDbAvailable)(
  'Catalog & Inventory API Integration Tests (Database Verification Required)',
  () => {
    const adminToken = 'mock_admin_token';
    let createdCategoryId: string;
    let createdProductId: string;

    beforeAll(async () => {
      // Clean up previous test catalog data
      await prisma.productImage.deleteMany();
      await prisma.productVariant.deleteMany();
      await prisma.product.deleteMany();
      await prisma.category.deleteMany();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('should create a root category in PostgreSQL and return valid CUID', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Apparel & Fashion',
          description: 'Clothing line',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('apparel-fashion');
      createdCategoryId = res.body.data.id;
    });

    it('should create a product with variants in a single atomic transaction', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Oxford Cotton Shirt',
          description: 'Long sleeve button down cotton shirt',
          categoryId: createdCategoryId,
          status: 'ACTIVE',
          variants: [
            {
              name: 'White / M',
              sku: 'OXFORD-WHT-M',
              price: 1500,
              compareAtPrice: 1800,
              costPrice: 900,
            },
            {
              name: 'White / L',
              sku: 'OXFORD-WHT-L',
              price: 1500,
              compareAtPrice: 1800,
              costPrice: 900,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.variants).toHaveLength(2);
      createdProductId = res.body.data.id;
    });

    it('should return public catalog product hiding costPrice and internal fields', async () => {
      const res = await request(app).get('/api/v1/products');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const product = res.body.data[0];
      expect(product).toBeDefined();
      expect(product.variants[0]).not.toHaveProperty('costPrice');
      expect(product).not.toHaveProperty('status');
      expect(product).not.toHaveProperty('deletedAt');
    });

    it('should record an AuditLog row in database when variant price changes', async () => {
      const product = await prisma.product.findUnique({
        where: { id: createdProductId },
        include: { variants: true },
      });
      const variantId = product?.variants[0]?.id;

      const res = await request(app)
        .patch(`/api/v1/products/${createdProductId}/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 1650 });

      expect(res.status).toBe(200);

      const auditRow = await prisma.auditLog.findFirst({
        where: { targetId: variantId, action: 'PRICE_CHANGED' },
      });
      expect(auditRow).toBeDefined();
    });
  },
);
