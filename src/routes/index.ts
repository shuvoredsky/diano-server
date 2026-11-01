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

export { rootRouter };



