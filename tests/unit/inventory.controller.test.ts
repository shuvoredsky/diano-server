import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { generateAccessToken } from '@/utils/jwt.util';
import { authRepository } from '@/modules/auth/auth.repository';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import type { InventoryEntity, StockMovementEntity } from '@/modules/inventory/inventory.types';

describe('Inventory Admin Endpoints (Controller & Route Tests)', () => {
  let adminToken: string;
  let clerkToken: string;

  const mockInventoryItem: InventoryEntity = {
    id: 'inv-1',
    variantId: 'var-1',
    warehouseId: 'wh-1',
    onHand: 50,
    reserved: 10,
    damaged: 2,
    available: 38,
    reorderLevel: 15,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMovement: StockMovementEntity = {
    id: 'mov-1',
    variantId: 'var-1',
    warehouseId: 'wh-1',
    type: 'PURCHASE_RECEIPT',
    quantity: 50,
    onHandBefore: 0,
    onHandAfter: 50,
    reservedBefore: 0,
    reservedAfter: 0,
    damagedBefore: 0,
    damagedAfter: 0,
    referenceType: 'PURCHASE_ORDER',
    referenceId: 'PO-2026-0001',
    actorId: 'test-admin',
    reason: 'Initial PO receive',
    action: 'INVENTORY_RECEIVE',
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    adminToken = generateAccessToken({
      userId: 'test-super-admin',
      sessionId: 'session-admin',
      email: 'admin@diano.com',
      roles: ['SUPER_ADMIN'],
    });

    clerkToken = generateAccessToken({
      userId: 'test-clerk',
      sessionId: 'session-clerk',
      email: 'clerk@diano.com',
      roles: ['INVENTORY_CLERK'],
    });

    vi.spyOn(authRepository, 'findSessionById').mockImplementation(async (id: string) => ({
      id,
      userId: id === 'session-admin' ? 'test-super-admin' : 'test-clerk',
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
    }));
  });

  describe('Security & Permissions', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/api/v1/inventory');
      expect(response.status).toBe(401);
    });

    it('should return 403 when user lacks required permission', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(false);

      const response = await request(app)
        .post('/api/v1/inventory/receive')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: 10,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/inventory', () => {
    it('should return paginated list of inventory items', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      vi.spyOn(inventoryService, 'listInventory').mockResolvedValue({
        items: [mockInventoryItem],
        total: 1,
      });

      const response = await request(app)
        .get('/api/v1/inventory?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.pagination).toEqual(
        expect.objectContaining({
          page: 1,
          limit: 10,
          totalItems: 1,
          totalPages: 1,
        }),
      );
    });
  });

  describe('GET /api/v1/inventory/variant/:variantId', () => {
    it('should return inventory breakdown for a specific variant', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      vi.spyOn(inventoryService, 'getInventoryByVariant').mockResolvedValue([mockInventoryItem]);

      const response = await request(app)
        .get('/api/v1/inventory/variant/var-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data[0].variantId).toBe('var-1');
    });
  });

  describe('POST /api/v1/inventory/receive', () => {
    it('should receive stock and call service with actor info', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      const receiveSpy = vi.spyOn(inventoryService, 'receiveStock').mockResolvedValue({
        inventory: mockInventoryItem,
        movement: mockMovement,
      });

      const response = await request(app)
        .post('/api/v1/inventory/receive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: 20,
          referenceType: 'PURCHASE_ORDER',
          referenceId: 'PO-2026-0001',
          reason: 'PO shipment arrival',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(receiveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: 20,
          actorId: 'test-super-admin',
        }),
      );
    });

    it('should fail validation on non-positive quantity', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);

      const response = await request(app)
        .post('/api/v1/inventory/receive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: 0,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/inventory/adjust', () => {
    it('should adjust stock with reason and actor', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      const adjustSpy = vi.spyOn(inventoryService, 'adjustStock').mockResolvedValue({
        inventory: { ...mockInventoryItem, onHand: 48 },
        movement: { ...mockMovement, type: 'ADJUSTMENT_NEGATIVE', quantity: 2 },
      });

      const response = await request(app)
        .post('/api/v1/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: -2,
          reason: 'Physical count discrepancy',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(adjustSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: -2,
          actorId: 'test-super-admin',
          reason: 'Physical count discrepancy',
        }),
      );
    });
  });

  describe('POST /api/v1/inventory/damage', () => {
    it('should quarantine damaged stock', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      const damageSpy = vi.spyOn(inventoryService, 'markDamaged').mockResolvedValue({
        inventory: { ...mockInventoryItem, damaged: 5, available: 35 },
        movement: { ...mockMovement, type: 'DAMAGE', quantity: 3 },
      });

      const response = await request(app)
        .post('/api/v1/inventory/damage')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: 3,
          reason: 'Water damage during storage',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(damageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-1',
          warehouseId: 'wh-1',
          quantity: 3,
          actorId: 'test-super-admin',
        }),
      );
    });
  });

  describe('POST /api/v1/inventory/transfer', () => {
    it('should perform inter-warehouse stock transfer', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      const transferSpy = vi.spyOn(inventoryService, 'transferStock').mockResolvedValue({
        sourceInventory: { ...mockInventoryItem, onHand: 40 },
        targetInventory: { ...mockInventoryItem, warehouseId: 'wh-2', onHand: 10 },
        sourceMovement: { ...mockMovement, type: 'TRANSFER_OUT', quantity: 10 },
        targetMovement: { ...mockMovement, warehouseId: 'wh-2', type: 'TRANSFER_IN', quantity: 10 },
      });

      const response = await request(app)
        .post('/api/v1/inventory/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          variantId: 'var-1',
          sourceWarehouseId: 'wh-1',
          targetWarehouseId: 'wh-2',
          quantity: 10,
          reason: 'Rebalancing inventory to Chittagong branch',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(transferSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'var-1',
          sourceWarehouseId: 'wh-1',
          targetWarehouseId: 'wh-2',
          quantity: 10,
          actorId: 'test-super-admin',
        }),
      );
    });
  });

  describe('GET /api/v1/inventory/movements', () => {
    it('should list paginated stock ledger entries', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      vi.spyOn(inventoryService, 'listMovements').mockResolvedValue({
        items: [mockMovement],
        total: 1,
      });

      const response = await request(app)
        .get('/api/v1/inventory/movements?variantId=var-1&type=PURCHASE_RECEIPT')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].type).toBe('PURCHASE_RECEIPT');
    });
  });

  describe('GET /api/v1/inventory/low-stock', () => {
    it('should list low stock items', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      vi.spyOn(inventoryService, 'listLowStock').mockResolvedValue({
        items: [mockInventoryItem],
        total: 1,
      });

      const response = await request(app)
        .get('/api/v1/inventory/low-stock')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/v1/inventory/summary (Cost Permission Scenarios)', () => {
    it('should return complete financial valuation when user has inventory:view_cost permission', async () => {
      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
      vi.spyOn(inventoryService, 'getSummary').mockResolvedValue({
        totalProducts: 10,
        totalStockUnits: 100,
        available: 80,
        reserved: 15,
        damaged: 5,
        stockValue: 50000,
        damageValue: 2500,
        netStockValue: 47500,
      });

      const response = await request(app)
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.stockValue).toBe(50000);
      expect(response.body.data.netStockValue).toBe(47500);
    });

    it('should strip financial valuations when user lacks inventory:view_cost permission', async () => {
      // User has inventory:read but NOT inventory:view_cost
      vi.spyOn(permissionsCache, 'hasPermission').mockImplementation(
        async (_roles: string[], perm: string) => {
          if (perm === 'inventory:read') return true;
          return false;
        },
      );

      vi.spyOn(inventoryService, 'getSummary').mockImplementation(
        async (hasCostPerm: boolean) => {
          if (!hasCostPerm) {
            return {
              totalProducts: 10,
              totalStockUnits: 100,
              available: 80,
              reserved: 15,
              damaged: 5,
            };
          }
          return {
            totalProducts: 10,
            totalStockUnits: 100,
            available: 80,
            reserved: 15,
            damaged: 5,
            stockValue: 50000,
            damageValue: 2500,
            netStockValue: 47500,
          };
        },
      );

      const response = await request(app)
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${clerkToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalStockUnits).toBe(100);
      expect(response.body.data.stockValue).toBeUndefined();
      expect(response.body.data.netStockValue).toBeUndefined();
    });
  });
});
