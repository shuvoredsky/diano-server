import { Router } from 'express';
import { suppliersController } from './suppliers.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('supplier:read'), suppliersController.listSuppliers);
router.get('/:id', requirePermission('supplier:read'), suppliersController.getSupplierById);
router.post('/', requirePermission('supplier:manage'), suppliersController.createSupplier);
router.patch('/:id', requirePermission('supplier:manage'), suppliersController.updateSupplier);
router.delete('/:id', requirePermission('supplier:manage'), suppliersController.deleteSupplier);

export { router as suppliersRouter };
