import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { hashPassword } from '@/utils/password.util';
import { generateAccessToken } from '@/utils/jwt.util';

const hasTestDb = Boolean(
  process.env.TEST_DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL,
);

describe.skipIf(!hasTestDb)(
  'Reviews Moderation & Audit Logs Integration Tests (Real Test DB)',
  () => {
    const suffix = Date.now();
    let superAdminToken = '';
    let supportStaffToken = '';
    let verifiedBuyerToken = '';
    let unverifiedBuyerToken = '';

    let superAdminId = '';
    let supportStaffId = '';
    let verifiedBuyerId = '';
    let unverifiedBuyerId = '';

    let categoryId = '';
    let productId = '';
    const productSlug = `test-review-panjabi-${suffix}`;
    let variantId = '';
    let orderId = '';
    let orderItemId = '';
    let createdReviewId = '';
    let createdAuditLogId = '';

    beforeAll(async () => {
      await prisma.$connect();

      const passwordHash = await hashPassword('Password123!');

      // Ensure roles exist
      const superAdminRole = await prisma.role.upsert({
        where: { slug: 'super-admin' },
        update: {},
        create: {
          name: 'Super Admin',
          slug: 'super-admin',
          type: 'SUPER_ADMIN',
          isSystem: true,
        },
      });

      const supportStaffRole = await prisma.role.upsert({
        where: { slug: 'support-staff' },
        update: {},
        create: {
          name: 'Support Staff',
          slug: 'support-staff',
          type: 'SUPPORT_STAFF',
          isSystem: true,
        },
      });

      const customerRole = await prisma.role.upsert({
        where: { slug: 'customer' },
        update: {},
        create: {
          name: 'Customer',
          slug: 'customer',
          type: 'CUSTOMER',
          isSystem: true,
        },
      });

      // Helper to create active session and generate JWT access token
      const createTokenWithSession = async (userId: string, roles: string[], label: string) => {
        const sess = await prisma.session.create({
          data: {
            userId,
            tokenHash: `hash_${label}_${suffix}`,
            deviceCategory: 'DESKTOP',
            isRevoked: false,
            expiresAt: new Date(Date.now() + 3600_000),
          },
        });
        return generateAccessToken({
          userId,
          sessionId: sess.id,
          roles,
        });
      };

      // Create users
      const superAdmin = await prisma.user.create({
        data: {
          email: `rev_superadmin_${suffix}@diano.com.bd`,
          name: 'Review Super Admin',
          passwordHash,
          status: 'ACTIVE',
          isEmailVerified: true,
          roles: { create: { roleId: superAdminRole.id } },
        },
      });
      superAdminId = superAdmin.id;
      superAdminToken = await createTokenWithSession(superAdmin.id, ['super-admin'], 'sa');

      const supportStaff = await prisma.user.create({
        data: {
          email: `rev_support_${suffix}@diano.com.bd`,
          name: 'Review Support Staff',
          passwordHash,
          status: 'ACTIVE',
          isEmailVerified: true,
          roles: { create: { roleId: supportStaffRole.id } },
        },
      });
      supportStaffId = supportStaff.id;
      supportStaffToken = await createTokenWithSession(supportStaff.id, ['support-staff'], 'ss');

      const verifiedBuyer = await prisma.user.create({
        data: {
          email: `verified_buyer_${suffix}@example.com`,
          name: 'Verified Buyer',
          passwordHash,
          status: 'ACTIVE',
          isEmailVerified: true,
          roles: { create: { roleId: customerRole.id } },
        },
      });
      verifiedBuyerId = verifiedBuyer.id;
      verifiedBuyerToken = await createTokenWithSession(verifiedBuyer.id, ['customer'], 'vb');

      const unverifiedBuyer = await prisma.user.create({
        data: {
          email: `unverified_buyer_${suffix}@example.com`,
          name: 'Unverified Buyer',
          passwordHash,
          status: 'ACTIVE',
          isEmailVerified: true,
          roles: { create: { roleId: customerRole.id } },
        },
      });
      unverifiedBuyerId = unverifiedBuyer.id;
      unverifiedBuyerToken = await createTokenWithSession(unverifiedBuyer.id, ['customer'], 'ub');

      // Create category, product, variant, and a DELIVERED order for verifiedBuyer
      const category = await prisma.category.create({
        data: {
          name: `Review Test Category ${suffix}`,
          slug: `review-test-cat-${suffix}`,
          isActive: true,
        },
      });
      categoryId = category.id;

      const product = await prisma.product.create({
        data: {
          name: `Test Review Panjabi ${suffix}`,
          slug: productSlug,
          description: 'Premium cotton panjabi',
          categoryId: category.id,
          status: 'PUBLISHED',
        },
      });
      productId = product.id;

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: 'L / White',
          sku: `SKU-REV-${suffix}`,
          price: 2500,
          isActive: true,
        },
      });
      variantId = variant.id;

      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-REV-${suffix}`,
          customerId: verifiedBuyer.id,
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          paymentMethod: 'COD',
          subtotal: 2500,
          shippingTotal: 60,
          grandTotal: 2560,
          shippingAddressSnapshot: {
            fullName: 'Verified Buyer',
            phone: '+8801711111111',
            addressLine: 'House 10, Road 5, Dhanmondi',
            city: 'Dhaka',
            district: 'Dhaka',
          },
          customerSnapshot: {
            name: 'Verified Buyer',
            email: verifiedBuyer.email,
            phone: '+8801711111111',
          },
          deliveredAt: new Date(),
          items: {
            create: {
              variantId: variant.id,
              productName: product.name,
              variantName: variant.name,
              sku: variant.sku,
              quantity: 1,
              unitPrice: 2500,
              lineTotal: 2500,
            },
          },
        },
        include: { items: true },
      });
      orderId = order.id;
      orderItemId = order.items[0].id;

      // Insert an audit log entry containing sensitive metadata to test redaction on read
      const rawAudit = await prisma.auditLog.create({
        data: {
          actorId: superAdmin.id,
          actorType: 'USER',
          action: `TEST_SENSITIVE_ACTION_${suffix}`,
          targetType: 'Product',
          targetId: product.id,
          ipAddress: '103.112.45.89',
          userAgent: 'IntegrationTestAgent/1.0',
          metadata: {
            safeNote: 'Product updated',
            password: 'should_never_be_exposed',
            token: 'should_never_be_exposed_jwt',
            secret: 'should_never_be_exposed_secret',
          },
        },
      });
      createdAuditLogId = rawAudit.id;
    }, 60000);

    afterAll(async () => {
      if (productId) {
        await prisma.reviewImage.deleteMany({
          where: { review: { productId } },
        });
        await prisma.review.deleteMany({ where: { productId } });
      }
      if (orderItemId) {
        await prisma.orderItem.deleteMany({ where: { id: orderItemId } });
      }
      if (orderId) {
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      if (variantId) {
        await prisma.productVariant.deleteMany({ where: { id: variantId } });
      }
      if (productId) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { id: createdAuditLogId },
            { actorId: { in: [superAdminId, verifiedBuyerId, unverifiedBuyerId].filter(Boolean) } },
          ],
        },
      });
      await prisma.notification.deleteMany({
        where: { template: 'new_review_admin_alert' },
      });
      const userIds = [superAdminId, supportStaffId, verifiedBuyerId, unverifiedBuyerId].filter(
        Boolean,
      );
      if (userIds.length > 0) {
        await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.$disconnect();
    }, 60000);

    it('rejects review submission from a user without a delivered purchase (403)', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productSlug}/reviews`)
        .set('Authorization', `Bearer ${unverifiedBuyerToken}`)
        .send({
          rating: 5,
          title: 'Nice',
          comment: 'Trying to review without buying and receiving',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Verified purchase required');
    });

    it('allows verified purchaser to submit a review, strips XSS, sets PENDING, and notifies admin', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productSlug}/reviews`)
        .set('Authorization', `Bearer ${verifiedBuyerToken}`)
        .send({
          rating: 5,
          title: '<script>alert("xss")</script>Excellent Panjabi!',
          comment: 'Fabric is top notch! <img src=x onerror=alert(1)> Highly recommended.',
          images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.isVerifiedPurchase).toBe(true);
      expect(res.body.data.title).toBe('Excellent Panjabi!');
      expect(res.body.data.comment).toBe('Fabric is top notch!  Highly recommended.');
      expect(res.body.data.images).toHaveLength(1);
      createdReviewId = res.body.data.id;

      // Verify admin notification was enqueued
      const adminNotif = await prisma.notification.findFirst({
        where: {
          dedupeKey: `review_submitted:${createdReviewId}`,
        },
      });
      expect(adminNotif).not.toBeNull();
    });

    it('rejects duplicate review from the same user for the same product (409)', async () => {
      const res = await request(app)
        .post(`/api/v1/products/${productSlug}/reviews`)
        .set('Authorization', `Bearer ${verifiedBuyerToken}`)
        .send({
          rating: 4,
          comment: 'Attempting a second review on the same product',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
    });

    it('hides PENDING reviews from public GET /api/v1/products/:slug/reviews', async () => {
      const res = await request(app)
        .get(`/api/v1/products/${productSlug}/reviews`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.summary.totalReviews).toBe(0);
      expect(res.body.data.summary.averageRating).toBe(0);
    });

    it('lists and fetches review in admin moderation queue, approves it, and updates product rating aggregate', async () => {
      const listRes = await request(app)
        .get('/api/v1/admin/reviews')
        .query({ status: 'PENDING', productId })
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(listRes.body.data.some((r: { id: string }) => r.id === createdReviewId)).toBe(true);

      const detailRes = await request(app)
        .get(`/api/v1/admin/reviews/${createdReviewId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(detailRes.body.data.id).toBe(createdReviewId);

      // Approve the review
      const patchRes = await request(app)
        .patch(`/api/v1/admin/reviews/${createdReviewId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          status: 'APPROVED',
          reason: 'Authentic verified buyer review',
        })
        .expect(200);

      expect(patchRes.body.data.status).toBe('APPROVED');
      expect(patchRes.body.data.moderationReason).toBe('Authentic verified buyer review');

      // Check public endpoint now includes the approved review and updated rating summary
      const pubRes = await request(app)
        .get(`/api/v1/products/${productSlug}/reviews`)
        .expect(200);

      expect(pubRes.body.data.items).toHaveLength(1);
      expect(pubRes.body.data.summary.totalReviews).toBe(1);
      expect(pubRes.body.data.summary.averageRating).toBe(5);
      expect(pubRes.body.data.summary.distribution['5']).toBe(1);

      // Verify Product table columns updated in DB
      const updatedProduct = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(Number(updatedProduct?.averageRating)).toBe(5);
      expect(updatedProduct?.reviewCount).toBe(1);
    });

    it('soft-deletes review via DELETE /api/v1/admin/reviews/:id and recalculates product rating back to 0', async () => {
      await request(app)
        .delete(`/api/v1/admin/reviews/${createdReviewId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      const pubRes = await request(app)
        .get(`/api/v1/products/${productSlug}/reviews`)
        .expect(200);

      expect(pubRes.body.data.items).toHaveLength(0);
      expect(pubRes.body.data.summary.totalReviews).toBe(0);
      expect(pubRes.body.data.summary.averageRating).toBe(0);

      const updatedProduct = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(Number(updatedProduct?.averageRating)).toBe(0);
      expect(updatedProduct?.reviewCount).toBe(0);
    });

    it('enforces audit:view RBAC on GET /api/v1/admin/audit-logs and redacts sensitive metadata', async () => {
      // Support staff without audit:view gets 403
      await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${supportStaffToken}`)
        .expect(403);

      // Super admin gets 200 with filtered audit logs
      const listRes = await request(app)
        .get('/api/v1/admin/audit-logs')
        .query({
          action: `TEST_SENSITIVE_ACTION_${suffix}`,
          targetType: 'Product',
          targetId: productId,
        })
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      const detailRes = await request(app)
        .get(`/api/v1/admin/audit-logs/${createdAuditLogId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(detailRes.body.data.id).toBe(createdAuditLogId);
      expect(detailRes.body.data.metadata.safeNote).toBe('Product updated');
      expect(detailRes.body.data.metadata).not.toHaveProperty('password');
      expect(detailRes.body.data.metadata).not.toHaveProperty('token');
      expect(detailRes.body.data.metadata).not.toHaveProperty('secret');

      // Append-only: POST/DELETE on /api/v1/admin/audit-logs must not exist
      await request(app)
        .post('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({})
        .expect(404);
    });
  },
);
