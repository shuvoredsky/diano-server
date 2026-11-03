import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from '@/modules/auth/auth.routes';
import { usersRouter } from '@/modules/users/users.routes';
import { rolesRouter } from '@/modules/roles/roles.routes';
import { permissionsRouter } from '@/modules/permissions/permissions.routes';
import { customersRouter } from '@/modules/customers/customers.routes';
import { categoriesRouter } from '@/modules/categories/categories.routes';
import { productsRouter } from '@/modules/products/products.routes';
import { inventoryRouter } from '@/modules/inventory/inventory.routes';
import { suppliersRouter } from '@/modules/suppliers/suppliers.routes';
import { purchaseOrdersRouter } from '@/modules/purchase-orders/purchase-orders.routes';

import { cartRouter } from '@/modules/cart/cart.routes';
import { wishlistRouter } from '@/modules/wishlist/wishlist.routes';
import { checkoutRouter } from '@/modules/checkout/checkout.routes';
import { abandonedCheckoutRouter } from '@/modules/abandoned-checkout/abandoned-checkout.routes';

import { siteSettingsRouter } from '@/modules/site-settings/site-settings.routes';
import { siteSettingsController } from '@/modules/site-settings/site-settings.controller';
import { bannersRouter, publicBannersRouter } from '@/modules/banners/banners.routes';
import { pagesRouter, publicPagesRouter } from '@/modules/pages/pages.routes';
import { ordersRouter, adminOrdersRouter } from '@/modules/orders/orders.routes';
import { paymentsRouter, adminPaymentsRouter } from '@/modules/payments/payments.routes';
import { adminFraudRouter } from '@/modules/fraud-detection/fraud.routes';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { shippingRouter, adminShippingRouter } from '@/modules/shipping/shipping.routes';
import { shippingController } from '@/modules/shipping/shipping.controller';
import {
  adminCouponsRouter,
  adminFlashSalesRouter,
  publicFlashSalesRouter,
} from '@/modules/coupons/coupons.routes';
import { customerReturnsRouter, adminReturnsRouter } from '@/modules/returns/returns.routes';
import { adminRefundsRouter } from '@/modules/refunds/refunds.routes';
import { adminExpensesRouter } from '@/modules/expenses/expenses.routes';
import { adminAnalyticsRouter } from '@/modules/analytics/analytics.routes';
import { adminReportsRouter } from '@/modules/reports/reports.routes';
import { internalJobsRouter } from '@/modules/internal/internal-jobs.routes';

const rootRouter = Router();

// Root health and readiness probes
rootRouter.use('/', healthRouter);

// Internal scheduled maintenance jobs
rootRouter.use('/internal', internalJobsRouter);

// Authentication & Identity
rootRouter.use('/auth', authRouter);

// User Management (Admin)
rootRouter.use('/users', usersRouter);

// RBAC Roles & Permissions
rootRouter.use('/roles', rolesRouter);
rootRouter.use('/permissions', permissionsRouter);

// Customers (Self-Service & Admin)
rootRouter.use('/customers', customersRouter);

// Categories (Catalog)
rootRouter.use('/categories', categoriesRouter);

// Products & Variants (Catalog)
rootRouter.use('/products', productsRouter);

// Inventory & Warehouse Management (Admin)
rootRouter.use('/inventory', inventoryRouter);

// Suppliers & Inbound Purchase Orders (Admin)
rootRouter.use('/suppliers', suppliersRouter);
rootRouter.use('/purchase-orders', purchaseOrdersRouter);

// Cart & Wishlist
rootRouter.use('/cart', cartRouter);
rootRouter.use('/wishlist', wishlistRouter);

// Checkout & Abandoned Checkouts
rootRouter.use('/checkout', checkoutRouter);
rootRouter.use('/abandoned-checkouts', abandonedCheckoutRouter);

// Site Settings (Admin & Public)
rootRouter.use('/settings', siteSettingsRouter);
rootRouter.get('/public/site-config', siteSettingsController.getPublicSiteConfig);

// Banners (Admin & Public)
rootRouter.use('/banners', bannersRouter);
rootRouter.use('/public/banners', publicBannersRouter);

// CMS Pages (Admin & Public)
rootRouter.use('/pages', pagesRouter);
rootRouter.use('/public/pages', publicPagesRouter);

// Orders & Invoicing (Customer & Admin)
rootRouter.use('/admin/orders', adminOrdersRouter);
rootRouter.use('/orders', ordersRouter);

// Payments & Gateways (Customer & Admin)
rootRouter.use('/admin/payments', adminPaymentsRouter);
rootRouter.use('/payments', paymentsRouter);

// Fraud Detection & Review Queue (Admin)
rootRouter.use('/admin/fraud', adminFraudRouter);

// Shipping & Logistics (Public & Admin)
rootRouter.use('/shipping', shippingRouter);
rootRouter.use('/admin/shipping', adminShippingRouter);
rootRouter.patch(
  '/admin/shipments/:id/status',
  authenticate,
  requirePermission('order:ship', 'shipping:manage'),
  shippingController.updateShipmentStatus,
);

// Coupons & Promotions (Public & Admin)
rootRouter.use('/admin/coupons', adminCouponsRouter);
rootRouter.use('/admin/flash-sales', adminFlashSalesRouter);
rootRouter.use('/flash-sales', publicFlashSalesRouter);

// Returns & Inspections (Customer & Admin)
rootRouter.use('/admin/returns', adminReturnsRouter);
rootRouter.use('/', customerReturnsRouter);

// Refunds (Admin)
rootRouter.use('/admin/refunds', adminRefundsRouter);

// Expenses (Admin)
rootRouter.use('/admin/expenses', adminExpensesRouter);

// Analytics (Admin)
rootRouter.use('/admin/analytics', adminAnalyticsRouter);

// Reports (Admin)
rootRouter.use('/admin/reports', adminReportsRouter);

export { rootRouter };

