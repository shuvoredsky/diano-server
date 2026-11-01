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

export { rootRouter };



