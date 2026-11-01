import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { suppliersService } from '@/modules/suppliers/suppliers.service';
import { purchaseOrdersService } from '@/modules/purchase-orders/purchase-orders.service';
import { stockAuditService } from '@/modules/inventory/stock-audit.service';
import { generateAccessToken } from '@/utils/jwt.util';
import { authRepository } from '@/modules/auth/auth.repository';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { PurchaseOrderStatus } from '@prisma/client';

describe('Suppliers, Purchase Orders & Stock Audit Endpoints (Supertest)', () => {
  let adminToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();

    adminToken = generateAccessToken({
      userId: 'test-admin',
      sessionId: 'session-123',
      email: 'admin@diano.com',
      roles: ['SUPER_ADMIN'],
    });

    vi.spyOn(authRepository, 'findSessionById').mockResolvedValue({
      id: 'session-123',
      userId: 'test-admin',
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

  describe('Suppliers Endpoints', () => {
    it('GET /api/v1/suppliers should return paginated suppliers list', async () => {
      vi.spyOn(suppliersService, 'listSuppliers').mockResolvedValue({
        items: [
          {
            id: 'sup-1',
            name: 'Apex Shoes',
            code: 'SUP-APEX',
            contactPerson: 'Mr. X',
            email: 'apex@test.com',
            phone: '01700000000',
            address: 'Dhaka',
            isActive: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
      });

      const response = await request(app)
        .get('/api/v1/suppliers?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('POST /api/v1/suppliers should create supplier', async () => {
      const createSpy = vi.spyOn(suppliersService, 'createSupplier').mockResolvedValue({
        id: 'sup-2',
        name: 'Bata BD',
        code: 'SUP-BATA',
        contactPerson: null,
        email: null,
        phone: null,
        address: null,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bata BD' });

      expect(response.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bata BD' }),
        expect.objectContaining({ userId: 'test-admin' }),
      );
    });
  });

  describe('Purchase Orders Endpoints', () => {
    it('POST /api/v1/purchase-orders should create draft PO', async () => {
      const createPoSpy = vi.spyOn(purchaseOrdersService, 'createPurchaseOrder').mockResolvedValue({
        id: 'po-1',
        poNumber: 'PO-20261101-ABCD',
        supplierId: 'sup-1',
        warehouseId: 'wh-1',
        status: PurchaseOrderStatus.DRAFT,
        totalAmount: 500,
        orderedAt: null,
        expectedDeliveryDate: null,
        receivedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId: 'sup-1',
          warehouseId: 'wh-1',
          items: [{ variantId: 'var-1', orderedQuantity: 5, unitCost: 100 }],
        });

      expect(response.status).toBe(201);
      expect(createPoSpy).toHaveBeenCalled();
    });

    it('PATCH /api/v1/purchase-orders/:id/status should update status to ORDERED', async () => {
      const updateStatusSpy = vi.spyOn(purchaseOrdersService, 'updateStatus').mockResolvedValue({
        id: 'po-1',
        poNumber: 'PO-20261101-ABCD',
        supplierId: 'sup-1',
        warehouseId: 'wh-1',
        status: PurchaseOrderStatus.ORDERED,
        totalAmount: 500,
        orderedAt: new Date(),
        expectedDeliveryDate: null,
        receivedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .patch('/api/v1/purchase-orders/po-1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ORDERED' });

      expect(response.status).toBe(200);
      expect(updateStatusSpy).toHaveBeenCalledWith('po-1', 'ORDERED', expect.anything());
    });

    it('POST /api/v1/purchase-orders/:id/receive should receive goods against PO', async () => {
      const receiveSpy = vi.spyOn(purchaseOrdersService, 'receivePoItems').mockResolvedValue({
        id: 'po-1',
        poNumber: 'PO-20261101-ABCD',
        supplierId: 'sup-1',
        warehouseId: 'wh-1',
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
        totalAmount: 500,
        orderedAt: new Date(),
        expectedDeliveryDate: null,
        receivedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .post('/api/v1/purchase-orders/po-1/receive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ variantId: 'var-1', quantity: 2 }],
          notes: 'Partial shipment arrival',
        });

      expect(response.status).toBe(200);
      expect(receiveSpy).toHaveBeenCalledWith(
        'po-1',
        expect.objectContaining({
          items: [{ variantId: 'var-1', quantity: 2 }],
        }),
        expect.anything(),
      );
    });
  });

  describe('Stock Audit Endpoints', () => {
    it('POST /api/v1/inventory/audits should initiate stock count', async () => {
      const startAuditSpy = vi.spyOn(stockAuditService, 'startAudit').mockResolvedValue({
        id: 'audit-1',
        warehouseId: 'wh-1',
        auditorId: 'test-admin',
        status: 'IN_PROGRESS',
        discrepanciesFound: 0,
        notes: 'Monthly physical inventory count',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .post('/api/v1/inventory/audits')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseId: 'wh-1',
          notes: 'Monthly physical inventory count',
        });

      expect(response.status).toBe(201);
      expect(startAuditSpy).toHaveBeenCalled();
    });

    it('POST /api/v1/inventory/audits/:id/counts should record physical counts', async () => {
      const countsSpy = vi.spyOn(stockAuditService, 'recordCounts').mockResolvedValue({
        id: 'audit-1',
        warehouseId: 'wh-1',
        auditorId: 'test-admin',
        status: 'IN_PROGRESS',
        discrepanciesFound: 1,
        notes: null,
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .post('/api/v1/inventory/audits/audit-1/counts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ variantId: 'var-1', countedQuantity: 12 }],
        });

      expect(response.status).toBe(200);
      expect(countsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          auditId: 'audit-1',
          items: [{ variantId: 'var-1', countedQuantity: 12 }],
        }),
        'test-admin',
      );
    });

    it('POST /api/v1/inventory/audits/:id/approve should approve and reconcile stock via ledger', async () => {
      const approveSpy = vi.spyOn(stockAuditService, 'approveAudit').mockResolvedValue({
        id: 'audit-1',
        warehouseId: 'wh-1',
        auditorId: 'test-admin',
        status: 'APPROVED',
        discrepanciesFound: 1,
        notes: null,
        startedAt: new Date(),
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .post('/api/v1/inventory/audits/audit-1/approve')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(approveSpy).toHaveBeenCalledWith('audit-1', 'test-admin');
    });
  });
});
