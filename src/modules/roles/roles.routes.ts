import { Router } from 'express';
import { rolesController } from './roles.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';

const rolesRouter = Router();

// All role routes require authentication
rolesRouter.use(authenticate);

rolesRouter.get('/', requirePermission('role:read'), rolesController.listRoles);
rolesRouter.get('/:id', requirePermission('role:read'), rolesController.getRoleById);
rolesRouter.post('/', requirePermission('role:create'), rolesController.createRole);
rolesRouter.patch('/:id', requirePermission('role:update'), rolesController.updateRole);
rolesRouter.delete('/:id', requirePermission('role:delete'), rolesController.deleteRole);
rolesRouter.put('/:id/permissions', requirePermission('role:update'), rolesController.assignPermissions);

export { rolesRouter };
