import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import {
  createTestSuperAdminAuth,
  createTestCustomerAuth,
  createTestUserWithPermissions,
} from './test-auth-helper';

describe('Reports Module Integration Tests', () => {
  let adminToken: string;
  let customerToken: string;
  let staffWithoutPiiToken: string; // Has report:export, but NOT report:export_pii or analytics:view_finance
  let testCustomerId: string;

  const cleanupOrderIds: string[] = [];

  beforeAll(async () => {
    const adminAuth = await createTestSuperAdminAuth();
    adminToken = `Bearer ${adminAuth.token}`;

    const customerAuth = await createTestCustomerAuth();
    customerToken = `Bearer ${customerAuth.token}`;
    testCustomerId = customerAuth.userId;

    const staffAuth = await createTestUserWithPermissions('reports_staff_role', [
      'report:export',
    ]);
    staffWithoutPiiToken = `Bearer ${staffAuth.token}`;

    // Seed test order with known PII and formula-like note
    const orderNumber = `ORD-RPT-${Date.now()}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId: testCustomerId,
        status: 'CONFIRMED',
        subtotal: 2500.0,
        discountTotal: 100.0,
        shippingTotal: 60.0,
        taxTotal: 0.0,
        grandTotal: 2460.0,
        paymentStatus: 'PAID',
        paymentMethod: 'COD',
        shippingAddressSnapshot: {
          district: '+12345678', // Attempt formula injection
          city: 'Dhaka',
          phone: '01799887766',
        },
        customerSnapshot: {
          name: '=SUM(1,2)', // Attempt formula injection
          phone: '01799887766',
          email: 'secretpii@diano.com',
        },
      },
    });
    cleanupOrderIds.push(order.id);
  });

  afterAll(async () => {
    if (cleanupOrderIds.length > 0) {
      await prisma.order.deleteMany({ where: { id: { in: cleanupOrderIds } } });
    }
  });

  it('rejects unauthenticated requests to report endpoints', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reports/orders')
      .send({ format: 'csv', period: 'this_month' });
    expect(res.status).toBe(401);
  });

  it('rejects unauthorized customers lacking report:export', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reports/orders')
      .set('Authorization', customerToken)
      .send({ format: 'csv', period: 'this_month' });
    expect(res.status).toBe(403);
  });

  it('exports orders report as CSV with streaming and formula injection protection', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reports/orders')
      .set('Authorization', adminToken)
      .send({ format: 'csv', period: 'this_month' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);

    const csvText = res.text;
    expect(csvText).toContain('Order Number');
    expect(csvText).toContain('Customer Name');

    // Formula injection verification: cells starting with '=' or '+' should be escaped with a single quote "'"
    expect(csvText).toMatch(/'=SUM\(1,2\)/);
    expect(csvText).toMatch(/'\+12345678/);
  });

  it('exports orders report as XLSX streaming workbook', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reports/orders')
      .set('Authorization', adminToken)
      .send({ format: 'xlsx', period: 'this_month' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/openxmlformats/);
    expect(res.headers['content-disposition']).toMatch(/\.xlsx"/);
  });

  it('masks customer phone and email when staff lacks report:export_pii', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reports/orders')
      .set('Authorization', staffWithoutPiiToken)
      .send({ format: 'csv', period: 'this_month' });

    expect(res.status).toBe(200);
    const csvText = res.text;

    // Must NOT contain raw PII
    expect(csvText).not.toContain('01799887766');
    expect(csvText).not.toContain('secretpii@diano.com');

    // MUST contain masked variants
    expect(csvText).toContain('017****7766');
    expect(csvText).toContain('s***i@diano.com');
  });

  it('omits financial valuation and cost columns in inventory report without analytics:view_finance', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reports/inventory')
      .set('Authorization', staffWithoutPiiToken)
      .send({ format: 'csv' });

    expect(res.status).toBe(200);
    const csvText = res.text;
    expect(csvText).toContain('Product');
    expect(csvText).toContain('On Hand');
    // Financial columns stripped
    expect(csvText).not.toContain('Cost Price');
    expect(csvText).not.toContain('Total Valuation');
  });

  it('blocks financial statement report export if analytics:view_finance is missing', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reports/financial')
      .set('Authorization', staffWithoutPiiToken)
      .send({ format: 'csv', period: 'this_month' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/analytics:view_finance/);
  });

  it('allows super-admin to export financial summary statement report', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reports/financial')
      .set('Authorization', adminToken)
      .send({ format: 'csv', period: 'this_month' });

    expect(res.status).toBe(200);
    const csvText = res.text;
    expect(csvText).toContain('Gross Sales');
    expect(csvText).toContain('Net Sales');
    expect(csvText).toContain('Gross Profit');
    expect(csvText).toContain('Net Operating Profit');
  });
});
