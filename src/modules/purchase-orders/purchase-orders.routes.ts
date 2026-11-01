import { Router } from 'express';
import { purchaseOrdersController } from './purchase-orders.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// ==============================================================================
// PURCHASE ORDER MANAGEMENT
// ==============================================================================

router.get('/', requirePermission('supplier:read'), purchaseOrdersController.listPurchaseOrders);
router.get('/:id', requirePermission('supplier:read'), purchaseOrdersController.getPurchaseOrderById);
router.post('/', requirePermission('supplier:manage'), purchaseOrdersController.createPurchaseOrder);
router.patch('/:id/status', requirePermission('supplier:manage'), purchaseOrdersController.updateStatus);
router.post('/:id/receive', requirePermission('supplier:manage'), purchaseOrdersController.receivePoItems);

export { router as purchaseOrdersRouter };
