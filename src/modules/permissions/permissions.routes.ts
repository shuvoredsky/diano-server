import { Router } from 'express';
import { permissionsController } from './permissions.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';

const permissionsRouter = Router();

// Read permissions requires authentication and role:read permission
permissionsRouter.use(authenticate);
permissionsRouter.get('/', requirePermission('role:read'), permissionsController.listPermissions);

export { permissionsRouter };
