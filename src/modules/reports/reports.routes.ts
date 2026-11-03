import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { reportsController } from './reports.controller';

const adminReportsRouter = Router();

adminReportsRouter.use(authenticate, requirePermission('report:export'));

adminReportsRouter.post('/orders', reportsController.exportOrders);
adminReportsRouter.post('/sales', reportsController.exportSales);
adminReportsRouter.post('/inventory', reportsController.exportInventory);
adminReportsRouter.post('/customers', reportsController.exportCustomers);
adminReportsRouter.post(
  '/financial',
  requirePermission('analytics:view_finance'),
  reportsController.exportFinancial,
);

export { adminReportsRouter };
