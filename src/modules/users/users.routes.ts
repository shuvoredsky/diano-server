import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';

const usersRouter = Router();

// All user management routes require authenticated session
usersRouter.use(authenticate);

usersRouter.get('/', requirePermission('user:read'), usersController.listUsers);
usersRouter.get('/:id', requirePermission('user:read'), usersController.getUserById);
usersRouter.post('/', requirePermission('user:create'), usersController.createUser);
usersRouter.patch('/:id', requirePermission('user:update'), usersController.updateUser);
usersRouter.patch('/:id/status', requirePermission('user:manage'), usersController.updateUserStatus);
usersRouter.delete('/:id', requirePermission('user:delete'), usersController.deleteUser);
usersRouter.post('/:id/revoke-sessions', requirePermission('user:manage'), usersController.revokeUserSessions);

export { usersRouter };
