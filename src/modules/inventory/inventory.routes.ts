import { Router } from 'express';
import { inventoryController } from './inventory.controller';
import { stockAuditController } from './stock-audit.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';

const router = Router();

// Apply authentication to all inventory admin endpoints
router.use(authenticate);

// ==============================================================================
// FIXED PATH ROUTES (MUST BE REGISTERED BEFORE PARAMETERIZED :id ROUTES)
// ==============================================================================

/**
 * GET /inventory/summary
 * Aggregated inventory totals (stock units, available, reserved, damaged, valuations)
 */
router.get('/summary', requirePermission('inventory:read'), inventoryController.getSummary);

/**
 * GET /inventory/movements
 * Immutable audit ledger of all stock mutations
 */
router.get('/movements', requirePermission('inventory:read'), inventoryController.listMovements);

/**
 * GET /inventory/low-stock
 * Filter variants below reorder threshold
 */
router.get('/low-stock', requirePermission('inventory:read'), inventoryController.listLowStock);

// ==============================================================================
// STOCK AUDITS (REGISTERED BEFORE PARAMETERIZED :variantId)
// ==============================================================================

router.post('/audits', requirePermission('inventory:audit'), stockAuditController.startAudit);
router.get('/audits', requirePermission('inventory:audit'), stockAuditController.listAudits);
router.get('/audits/:id', requirePermission('inventory:audit'), stockAuditController.getAuditById);
router.post('/audits/:id/counts', requirePermission('inventory:audit'), stockAuditController.recordCounts);
router.post('/audits/:id/approve', requirePermission('inventory:audit'), stockAuditController.approveAudit);
router.post('/audits/:id/reject', requirePermission('inventory:audit'), stockAuditController.rejectAudit);

// ==============================================================================
// PARAMETERIZED ROUTES
// ==============================================================================

/**
 * GET /inventory/variant/:variantId
 * Multi-warehouse inventory breakdown for a specific variant
 */
router.get('/variant/:variantId', requirePermission('inventory:read'), inventoryController.getInventoryByVariant);

/**
 * GET /inventory
 * Paginated inventory list with search and warehouse filtering
 */
router.get('/', requirePermission('inventory:read'), inventoryController.listInventory);

// ==============================================================================
// ATOMIC STOCK MUTATIONS
// ==============================================================================

/**
 * POST /inventory/receive
 * Inbound stock receipt against purchase order or manual receiving
 */
router.post('/receive', requirePermission('inventory:manage'), inventoryController.receiveStock);

/**
 * POST /inventory/adjust
 * Discrepancy adjustment with required reason and actor ID
 */
router.post('/adjust', requirePermission('inventory:manage'), inventoryController.adjustStock);

/**
 * POST /inventory/damage
 * Quarantine broken or expired units
 */
router.post('/damage', requirePermission('inventory:manage'), inventoryController.markDamaged);

/**
 * POST /inventory/transfer
 * Inter-warehouse transfer with deterministic deadlock-safe lock acquisition
 */
router.post('/transfer', requirePermission('inventory:manage'), inventoryController.transferStock);

export { router as inventoryRouter };
