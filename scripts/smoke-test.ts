import request from 'supertest';
import { app } from '../src/app';
import { pgPool, prisma } from '../src/config/database';
import { createTestSuperAdminAuth } from '../tests/integration/test-auth-helper';

async function runSmokeTests() {
  console.info('--- STARTING SMOKE TESTS ---');

  // ==========================================
  // Part 1: Main Database Smoke Test
  // ==========================================
  console.info('[Smoke Test 1] Testing Admin Login on Main DB...');
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error('SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD missing in environment');
  }

  const loginRes = await request(app)
    .post('/api/v1/auth/admin/login')
    .send({
      email: adminEmail,
      password: adminPassword,
    });

  if (loginRes.status !== 200) {
    throw new Error(`Admin login failed with status ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }

  const accessToken = loginRes.body.data.accessToken;
  const userRole = loginRes.body.data.user.roles?.[0]?.role?.slug || 'unknown';
  console.info(`[Smoke Test 1] Admin Login SUCCESS (status: 200, role: ${userRole})`);

  console.info('[Smoke Test 2] Testing GET /api/v1/auth/me on Main DB...');
  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`);

  if (meRes.status !== 200) {
    throw new Error(`GET /auth/me failed with status ${meRes.status}: ${JSON.stringify(meRes.body)}`);
  }
  console.info(`[Smoke Test 2] GET /auth/me SUCCESS (status: 200, verified user profile)`);

  // ==========================================
  // Part 2: Test Database Data Creation Smoke
  // (Main DB remains clean: test mutations only on test DB)
  // ==========================================
  console.info('[Smoke Test 3] Testing Category creation, Draft Product creation, and Public Catalog on Test DB...');
  
  // Set up authenticated test admin in Test DB
  const testAuth = await createTestSuperAdminAuth();

  // Create Category
  const catSlug = `smoke-cat-${Date.now()}`;
  const catRes = await request(app)
    .post('/api/v1/categories')
    .set('Authorization', `Bearer ${testAuth.token}`)
    .send({
      name: `Smoke Category ${Date.now()}`,
      slug: catSlug,
      description: 'Temporary smoke test category',
    });

  if (catRes.status !== 201) {
    throw new Error(`Category create failed with status ${catRes.status}: ${JSON.stringify(catRes.body)}`);
  }
  const createdCategoryId = catRes.body.data.id;
  console.info(`[Smoke Test 3] Category create SUCCESS (status: 201, id: ${createdCategoryId})`);

  // Create DRAFT Product
  const prodSlug = `smoke-draft-${Date.now()}`;
  const prodRes = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${testAuth.token}`)
    .send({
      name: 'Smoke Test Draft T-Shirt',
      slug: prodSlug,
      description: 'Draft product created during smoke test',
      categoryId: createdCategoryId,
      status: 'DRAFT',
      variants: [
        {
          name: 'Navy - M',
          sku: `SKU-SMOKE-${Date.now()}`,
          price: 1200,
          compareAtPrice: 1500,
          costPrice: 600,
        },
      ],
    });

  if (prodRes.status !== 201) {
    throw new Error(`Draft product create failed with status ${prodRes.status}: ${JSON.stringify(prodRes.body)}`);
  }
  const createdProductId = prodRes.body.data.id;
  console.info(`[Smoke Test 3] Draft Product create SUCCESS (status: 201, id: ${createdProductId}, status: DRAFT)`);

  // GET /products (Public catalog)
  const listRes = await request(app).get('/api/v1/products');
  if (listRes.status !== 200) {
    throw new Error(`GET /products failed with status ${listRes.status}`);
  }
  console.info(`[Smoke Test 3] GET /products SUCCESS (status: 200, returned ${listRes.body.data.length} items)`);

  // Clean up smoke test entities
  await prisma.productVariant.deleteMany({ where: { productId: createdProductId } }).catch(() => {});
  await prisma.product.deleteMany({ where: { id: createdProductId } }).catch(() => {});
  await prisma.category.deleteMany({ where: { id: createdCategoryId } }).catch(() => {});

  await prisma.$disconnect();
  await pgPool.end();

  console.info('--- ALL SMOKE TESTS PASSED CLEANLY ---');
}

runSmokeTests().catch(err => {
  console.error('[Smoke Test Error]:', err.message);
  process.exit(1);
});
