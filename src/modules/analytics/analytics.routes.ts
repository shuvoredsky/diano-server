import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { analyticsController } from './analytics.controller';

const adminAnalyticsRouter = Router();

adminAnalyticsRouter.use(authenticate, requirePermission('analytics:view'));

adminAnalyticsRouter.get('/overview', analyticsController.getOverview);
adminAnalyticsRouter.get('/revenue', analyticsController.getRevenue);
adminAnalyticsRouter.get('/orders', analyticsController.getOrders);
adminAnalyticsRouter.get('/products', analyticsController.getProducts);
adminAnalyticsRouter.get('/inventory', analyticsController.getInventory);
adminAnalyticsRouter.get('/customers', analyticsController.getCustomers);
adminAnalyticsRouter.get('/payments', analyticsController.getPayments);
adminAnalyticsRouter.get('/funnel', analyticsController.getFunnel);
adminAnalyticsRouter.get('/charts/:type', analyticsController.getChart);

export { adminAnalyticsRouter };
