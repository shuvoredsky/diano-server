import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/config/database';
import { createTestSuperAdminAuth, createTestCustomerAuth } from './test-auth-helper';

describe('Expenses Module Integration Tests', () => {
  let adminToken: string;
  let customerToken: string;
  const cleanupExpenseIds: string[] = [];

  beforeAll(async () => {
    const adminAuth = await createTestSuperAdminAuth();
    adminToken = `Bearer ${adminAuth.token}`;

    const customerAuth = await createTestCustomerAuth();
    customerToken = `Bearer ${customerAuth.token}`;
  });

  afterAll(async () => {
    if (cleanupExpenseIds.length > 0) {
      await prisma.expense.deleteMany({
        where: { id: { in: cleanupExpenseIds } },
      });
    }
  });

  it('rejects unauthenticated requests to /admin/expenses', async () => {
    const res = await request(app).get('/api/v1/admin/expenses');
    expect(res.status).toBe(401);
  });

  it('rejects unauthorized customers lacking expense:manage permission', async () => {
    const res = await request(app)
      .get('/api/v1/admin/expenses')
      .set('Authorization', customerToken);
    expect(res.status).toBe(403);
  });

  it('allows super-admin to create, list, retrieve, update, and delete expenses with audit logging', async () => {
    // 1. Create expense
    const createRes = await request(app)
      .post('/api/v1/admin/expenses')
      .set('Authorization', adminToken)
      .send({
        category: 'MARKETING',
        amount: 3500.5,
        date: new Date().toISOString(),
        note: 'Q4 Facebook Meta Ad Campaign',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.category).toBe('MARKETING');
    expect(createRes.body.data.amount).toBe('3500.50');
    const expenseId = createRes.body.data.id;
    cleanupExpenseIds.push(expenseId);

    // 2. Get by ID
    const getRes = await request(app)
      .get(`/api/v1/admin/expenses/${expenseId}`)
      .set('Authorization', adminToken);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(expenseId);
    expect(getRes.body.data.note).toBe('Q4 Facebook Meta Ad Campaign');

    // 3. List with category filter
    const listRes = await request(app)
      .get('/api/v1/admin/expenses?category=MARKETING')
      .set('Authorization', adminToken);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toBeInstanceOf(Array);
    const found = listRes.body.data.some((e: { id: string }) => e.id === expenseId);
    expect(found).toBe(true);

    // 4. Update expense
    const updateRes = await request(app)
      .put(`/api/v1/admin/expenses/${expenseId}`)
      .set('Authorization', adminToken)
      .send({
        amount: 4000.0,
        note: 'Updated: Q4 Meta & TikTok Ad Campaign',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.amount).toBe('4000.00');
    expect(updateRes.body.data.note).toBe('Updated: Q4 Meta & TikTok Ad Campaign');

    // 5. Delete expense
    const deleteRes = await request(app)
      .delete(`/api/v1/admin/expenses/${expenseId}`)
      .set('Authorization', adminToken);

    expect(deleteRes.status).toBe(200);

    // 6. Verify 404 after deletion
    const verifyRes = await request(app)
      .get(`/api/v1/admin/expenses/${expenseId}`)
      .set('Authorization', adminToken);
    expect(verifyRes.status).toBe(404);

    // 7. Verify audit log recorded
    const auditLogs = await prisma.auditLog.findMany({
      where: { targetType: 'Expense', targetId: expenseId },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
  });
});
