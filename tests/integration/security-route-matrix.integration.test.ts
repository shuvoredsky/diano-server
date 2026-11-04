import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '@/app';

describe('Security Hardening & Route Permission Matrix Tests', () => {
  // Public allowlist endpoints that are legitimately accessible without Bearer token
  const publicAllowlist = [
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/api/v1/health' },
    { method: 'GET', path: '/api/v1/ready' },
    { method: 'GET', path: '/api/v1/public/site-config' },
    { method: 'GET', path: '/api/v1/public/banners?placement=HOME_HERO' },
    { method: 'GET', path: '/api/v1/public/pages' },
    { method: 'GET', path: '/api/v1/categories' },
    { method: 'GET', path: '/api/v1/products' },
    { method: 'GET', path: '/api/v1/products/featured' },
    { method: 'GET', path: '/api/v1/flash-sales' },
    { method: 'GET', path: '/api/v1/shipping/methods' },
  ];

  // Protected administrative endpoints that MUST reject unauthenticated requests
  const protectedAdminEndpoints = [
    { method: 'GET', path: '/api/v1/admin/orders' },
    { method: 'GET', path: '/api/v1/admin/orders/kpis' },
    { method: 'GET', path: '/api/v1/admin/payments' },
    { method: 'GET', path: '/api/v1/admin/fraud/queue' },
    { method: 'GET', path: '/api/v1/admin/shipping/zones' },
    { method: 'GET', path: '/api/v1/admin/coupons' },
    { method: 'GET', path: '/api/v1/admin/returns' },
    { method: 'GET', path: '/api/v1/admin/refunds' },
    { method: 'GET', path: '/api/v1/admin/expenses' },
    { method: 'GET', path: '/api/v1/admin/analytics/overview' },
    { method: 'GET', path: '/api/v1/admin/reports/sales' },
    { method: 'GET', path: '/api/v1/admin/notifications/queue' },
    { method: 'GET', path: '/api/v1/users' },
    { method: 'GET', path: '/api/v1/roles' },
    { method: 'GET', path: '/api/v1/permissions' },
    { method: 'GET', path: '/api/v1/inventory/overview' },
    { method: 'GET', path: '/api/v1/suppliers' },
    { method: 'GET', path: '/api/v1/purchase-orders' },
    { method: 'GET', path: '/api/v1/customers' },
    { method: 'GET', path: '/api/v1/customers/me' },
    { method: 'GET', path: '/api/v1/wishlist' },
    { method: 'POST', path: '/api/v1/internal/jobs/cleanup-expired-orders' },
  ];

  describe('Route Permission Matrix: Unauthenticated Access Rejection', () => {
    it.each(protectedAdminEndpoints)(
      'should reject unauthenticated request to $method $path with 401 Unauthorized',
      async ({ method, path }) => {
        let req;
        if (method === 'GET') {
          req = request(app).get(path);
        } else if (method === 'POST') {
          req = request(app).post(path).send({});
        } else if (method === 'PUT') {
          req = request(app).put(path).send({});
        } else if (method === 'PATCH') {
          req = request(app).patch(path).send({});
        } else {
          req = request(app).delete(path);
        }

        const res = await req;
        // Never allow 200/201/204 to unauthenticated caller for protected admin endpoints
        expect(res.status).not.toBe(200);
        expect(res.status).not.toBe(201);
        expect(res.status).not.toBe(204);
        expect([401, 403]).toContain(res.status);
      },
    );

    it.each(publicAllowlist)(
      'should allow public access to $method $path without authentication',
      async ({ path }) => {
        const res = await request(app).get(path);
        expect([200, 304]).toContain(res.status);
      },
    );
  });

  describe('Security Headers & Hardening', () => {
    it('should include strict security headers and omit X-Powered-By', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.headers).not.toHaveProperty('x-powered-by');
      expect(res.headers).toHaveProperty('content-security-policy');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should reject prototype pollution attempts in JSON body', async () => {
      const maliciousPayload = JSON.parse('{"__proto__": {"admin": true}, "title": "test"}');

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send(maliciousPayload)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Illegal property detected');
    });

    it('should reject deeply nested JSON payloads beyond depth limit', async () => {
      let nested: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 15; i++) {
        nested = { child: nested };
      }

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send(nested)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('nesting depth');
    });
  });

  describe('Sensitive Data Exposure Guard', () => {
    it('public product endpoints must never leak costPrice or internal supplier data', async () => {
      const res = await request(app).get('/api/v1/products');

      expect(res.status).toBe(200);
      const jsonStr = JSON.stringify(res.body);

      // Sensitive fields that must NEVER appear in public responses
      expect(jsonStr).not.toContain('"costPrice"');
      expect(jsonStr).not.toContain('"passwordHash"');
      expect(jsonStr).not.toContain('"tokenHash"');
      expect(jsonStr).not.toContain('"clientSecret"');
      expect(jsonStr).not.toContain('"jobsSecret"');
    });

    it('public site config endpoint must never expose secrets or credentials', async () => {
      const res = await request(app).get('/api/v1/public/site-config');

      expect(res.status).toBe(200);
      const jsonStr = JSON.stringify(res.body);

      expect(jsonStr).not.toContain('"storePassword"');
      expect(jsonStr).not.toContain('"apiSecret"');
      expect(jsonStr).not.toContain('"jwtSecret"');
    });
  });
});
