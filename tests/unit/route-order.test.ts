import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { categoriesService } from '@/modules/categories/categories.service';
import { productsService } from '@/modules/products/products.service';
import { generateAccessToken } from '@/utils/jwt.util';
import { authRepository } from '@/modules/auth/auth.repository';
import { permissionsCache } from '@/modules/permissions/permissions.cache';

describe('Route Order Verification (Supertest)', () => {
  let adminToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();

    adminToken = generateAccessToken({
      userId: 'test-super-admin',
      sessionId: 'test-session-id',
      email: 'admin@diano.com',
      roles: ['SUPER_ADMIN'],
    });

    vi.spyOn(authRepository, 'findSessionById').mockResolvedValue({
      id: 'test-session-id',
      userId: 'test-super-admin',
      tokenHash: 'h',
      deviceCategory: 'DESKTOP',
      browser: null,
      os: null,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
  });

  it('PUT /api/v1/categories/reorder should route to reorderCategories and NOT be treated as :id', async () => {
    const reorderSpy = vi
      .spyOn(categoriesService, 'reorderCategories')
      .mockResolvedValue(undefined);

    const updateSpy = vi
      .spyOn(categoriesService, 'updateCategory')
      .mockResolvedValue({} as never);

    const response = await request(app)
      .put('/api/v1/categories/reorder')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ id: 'cat-1', sortOrder: 0 }] });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('reordered successfully');
    expect(reorderSpy).toHaveBeenCalledTimes(1);
    expect(reorderSpy).toHaveBeenCalledWith(
      [{ id: 'cat-1', sortOrder: 0 }],
      expect.objectContaining({ userId: 'test-super-admin' }),
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('GET /api/v1/categories/admin/all should route to getAdminCategories and NOT match /:slug', async () => {
    const adminAllSpy = vi
      .spyOn(categoriesService, 'getAdminCategories')
      .mockResolvedValue([]);

    const publicSlugSpy = vi
      .spyOn(categoriesService, 'getPublicCategoryBySlug')
      .mockResolvedValue({} as never);

    const response = await request(app)
      .get('/api/v1/categories/admin/all')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('retrieved successfully');
    expect(adminAllSpy).toHaveBeenCalledTimes(1);
    expect(publicSlugSpy).not.toHaveBeenCalled();
  });

  it('PUT /api/v1/products/:id/images/reorder should route to reorderProductImages and NOT match :imageId parameter', async () => {
    const reorderImagesSpy = vi
      .spyOn(productsService, 'reorderProductImages')
      .mockResolvedValue(undefined);

    const updateImageSpy = vi
      .spyOn(productsService, 'updateProductImage')
      .mockResolvedValue({} as never);

    const response = await request(app)
      .put('/api/v1/products/prod-123/images/reorder')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ id: 'img-1', sortOrder: 0 }] });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('reordered successfully');
    expect(reorderImagesSpy).toHaveBeenCalledTimes(1);
    expect(reorderImagesSpy).toHaveBeenCalledWith(
      'prod-123',
      [{ id: 'img-1', sortOrder: 0 }],
      expect.objectContaining({ userId: 'test-super-admin' }),
    );
    expect(updateImageSpy).not.toHaveBeenCalled();
  });
});
