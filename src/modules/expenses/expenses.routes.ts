import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { expensesController } from './expenses.controller';

const adminExpensesRouter = Router();

adminExpensesRouter.use(authenticate, requirePermission('expense:manage'));

adminExpensesRouter.post('/', expensesController.create);
adminExpensesRouter.get('/', expensesController.list);
adminExpensesRouter.get('/:id', expensesController.getById);
adminExpensesRouter.put('/:id', expensesController.update);
adminExpensesRouter.patch('/:id', expensesController.update);
adminExpensesRouter.delete('/:id', expensesController.delete);

export { adminExpensesRouter };
