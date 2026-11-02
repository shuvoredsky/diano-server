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

if (
  process.env.TEST_DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
) {
  throw new Error(
    'CRITICAL SAFETY REFUSAL: TEST_DATABASE_URL is identical to DATABASE_URL! Production/Main database could be wiped.',
  );
}

describe.skipIf(!isTestDbAvailable)(
  'CMS & Site Settings Integration Tests (Real Neon DB)',
  () => {
    let authHeader: string;
    let testAdminUserId: string;
    let testSessionId: string;

    const createdBannerIds: string[] = [];
    const createdPageIds: string[] = [];

    beforeAll(async () => {
      const auth = await createTestSuperAdminAuth();
      authHeader = `Bearer ${auth.token}`;
      testAdminUserId = auth.userId;
      testSessionId = auth.sessionId;
    });

    afterAll(async () => {
      // Targeted cleanups only
      for (const id of createdBannerIds) {
        await prisma.banner.deleteMany({ where: { id } }).catch(() => {});
      }
      for (const id of createdPageIds) {
        await prisma.pageRevision.deleteMany({ where: { pageId: id } }).catch(() => {});
        await prisma.page.deleteMany({ where: { id } }).catch(() => {});
      }
      if (testSessionId) {
        await prisma.session.deleteMany({ where: { id: testSessionId } }).catch(() => {});
      }
      if (testAdminUserId) {
        await prisma.userRole.deleteMany({ where: { userId: testAdminUserId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: testAdminUserId } }).catch(() => {});
      }
      await prisma.$disconnect();
    });

    describe('Site Settings & Public Config', () => {
      it('should update store profile and ensure public site-config does NOT leak internal/confidential fields', async () => {
        // 1. Update store_profile via Admin PATCH
        const updateRes = await request(app)
          .patch('/api/v1/settings/store_profile')
          .set('Authorization', authHeader)
          .send({
            storeName: 'Diano Bangladesh Official',
            tagline: 'Modern Bangladeshi Craftsmanship',
            phone: '+8801711223344',
            email: 'hello@diano.com.bd',
            address: 'Gulshan 2, Dhaka 1212',
            bin: 'CONFIDENTIAL-BIN-9999',
            vat: 'CONFIDENTIAL-VAT-8888',
            businessRegistration: 'REG-DHAKA-12345',
          });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.success).toBe(true);

        // 2. Fetch public site config
        const publicRes = await request(app).get('/api/v1/public/site-config');

        expect(publicRes.status).toBe(200);
        expect(publicRes.body.success).toBe(true);
        expect(publicRes.body.data.storeName).toBe('Diano Bangladesh Official');
        expect(publicRes.body.data.phone).toBe('+8801711223344');
        expect(publicRes.body.data.address).toBe('Gulshan 2, Dhaka 1212');

        // Verify confidentiality: NO internal bin/vat/businessRegistration
        expect(publicRes.body.data.bin).toBeUndefined();
        expect(publicRes.body.data.vat).toBeUndefined();
        expect(publicRes.body.data.businessRegistration).toBeUndefined();

        // 3. Verify ETag & 304 Not Modified
        const etag = publicRes.headers.etag;
        expect(etag).toBeDefined();

        const cachedRes = await request(app)
          .get('/api/v1/public/site-config')
          .set('If-None-Match', etag);

        expect(cachedRes.status).toBe(304);
      });
    });

    describe('Banners CRUD & Schedule Filtering', () => {
      it('should create banner, filter by schedule window, and toggle visibility', async () => {
        const createRes = await request(app)
          .post('/api/v1/banners')
          .set('Authorization', authHeader)
          .send({
            placement: 'HOME_HERO',
            title: 'Winter Launch 2026',
            desktopImage: 'https://images.diano.com/winter-hero.webp',
            linkUrl: '/collections/winter',
            ctaText: 'Shop Winter',
            isActive: true,
            sortOrder: 1,
          });

        expect(createRes.status).toBe(201);
        const bannerId = createRes.body.data.id;
        createdBannerIds.push(bannerId);

        // Public fetch
        const publicRes = await request(app)
          .get('/api/v1/public/banners')
          .query({ placement: 'HOME_HERO' });

        expect(publicRes.status).toBe(200);
        const heroBanners = publicRes.body.data;
        expect(heroBanners.some((b: { id: string }) => b.id === bannerId)).toBe(true);

        // Toggle inactive
        const toggleRes = await request(app)
          .patch(`/api/v1/banners/${bannerId}/toggle`)
          .set('Authorization', authHeader);

        expect(toggleRes.status).toBe(200);
        expect(toggleRes.body.data.isActive).toBe(false);

        // Public fetch should no longer return deactivated banner
        const publicAfterToggle = await request(app)
          .get('/api/v1/public/banners')
          .query({ placement: 'HOME_HERO' });

        expect(publicAfterToggle.body.data.some((b: { id: string }) => b.id === bannerId)).toBe(false);
      });
    });

    describe('Pages Lifecycle, Blocks, System Page Protection & Revisions', () => {
      it('should maintain draft vs published visibility, capture revisions, and block system page deletion', async () => {
        const uniqueSlug = `test-page-${Date.now()}`;

        // 1. Create page in DRAFT status
        const createRes = await request(app)
          .post('/api/v1/pages')
          .set('Authorization', authHeader)
          .send({
            slug: uniqueSlug,
            type: 'CUSTOM',
            title: 'Spring Festival Announcement',
            status: 'DRAFT',
            content: [
              { type: 'heading', level: 1, text: 'Spring Fest' },
              { type: 'richText', html: '<p>Spring discounts coming soon.</p>' },
            ],
          });

        expect(createRes.status).toBe(201);
        const pageId = createRes.body.data.id;
        createdPageIds.push(pageId);

        // 2. Draft page must return 404 on public route
        const draftPublicRes = await request(app).get(`/api/v1/public/pages/${uniqueSlug}`);
        expect(draftPublicRes.status).toBe(404);

        // 3. Publish page
        const publishRes = await request(app)
          .post(`/api/v1/pages/${pageId}/publish`)
          .set('Authorization', authHeader);

        expect(publishRes.status).toBe(200);
        expect(publishRes.body.data.status).toBe('PUBLISHED');
        expect(publishRes.body.data.version).toBe(2);

        // 4. Public fetch should now succeed
        const publishedPublicRes = await request(app).get(`/api/v1/public/pages/${uniqueSlug}`);
        expect(publishedPublicRes.status).toBe(200);
        expect(publishedPublicRes.body.data.title).toBe('Spring Festival Announcement');
        expect(publishedPublicRes.body.data.content).toHaveLength(2);

        // 5. Check revision snapshot
        const revisionsRes = await request(app)
          .get(`/api/v1/pages/${pageId}/revisions`)
          .set('Authorization', authHeader);

        expect(revisionsRes.status).toBe(200);
        expect(revisionsRes.body.data.length).toBeGreaterThanOrEqual(1);
        expect(revisionsRes.body.data[0].version).toBe(2);

        // 6. Navigation list includes published page
        const navRes = await request(app).get('/api/v1/public/pages');
        expect(navRes.status).toBe(200);
        expect(navRes.body.data.some((p: { slug: string }) => p.slug === uniqueSlug)).toBe(true);

        // 7. Verify system page deletion block
        const systemTerms = await prisma.page.upsert({
          where: { slug: 'terms' },
          update: {},
          create: {
            slug: 'terms',
            type: 'POLICY',
            title: 'Terms & Conditions',
            status: 'DRAFT',
          },
        });

        const deleteSystemRes = await request(app)
          .delete(`/api/v1/pages/${systemTerms.id}`)
          .set('Authorization', authHeader);

        expect(deleteSystemRes.status).toBe(400);
        expect(deleteSystemRes.body.message).toMatch(/cannot be deleted/);
      });
    });
  },
);
