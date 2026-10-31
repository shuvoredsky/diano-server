import { Router } from 'express';
import { customersController } from './customers.controller';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';

const customersRouter = Router();

// All customer endpoints require authentication
customersRouter.use(authenticate);

// -----------------------------------------------------------------------------
// Customer Self-Service Routes (/customers/me/...)
// -----------------------------------------------------------------------------
customersRouter.get('/me/profile', customersController.getProfile);
customersRouter.patch('/me/profile', customersController.updateProfile);

customersRouter.get('/me/addresses', customersController.listAddresses);
customersRouter.post('/me/addresses', customersController.addAddress);
customersRouter.patch('/me/addresses/:addressId', customersController.updateAddress);
customersRouter.delete('/me/addresses/:addressId', customersController.deleteAddress);

customersRouter.get('/me/consents', customersController.getConsents);
customersRouter.patch('/me/consents', customersController.updateConsents);

customersRouter.get('/me/data-export', customersController.exportData);
customersRouter.post('/me/delete-account', customersController.deleteAccount);

// -----------------------------------------------------------------------------
// Admin Customer Management Routes (/customers/...)
// -----------------------------------------------------------------------------
customersRouter.get('/', requirePermission('customer:read'), customersController.listCustomers);
customersRouter.get('/:id', requirePermission('customer:read'), customersController.getCustomerDetail);
customersRouter.patch('/:id/status', requirePermission('customer:manage'), customersController.updateCustomerStatus);
customersRouter.post('/:id/notes', requirePermission('customer:manage'), customersController.addCustomerNote);
customersRouter.get('/:id/notes', requirePermission('customer:read'), customersController.getCustomerNotes);
customersRouter.get('/:id/timeline', requirePermission('customer:read'), customersController.getCustomerTimeline);

export { customersRouter };
