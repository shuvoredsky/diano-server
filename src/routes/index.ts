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

const rootRouter = Router();

// Root health and readiness probes
rootRouter.use('/', healthRouter);

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

export { rootRouter };



