import type { Router } from 'express';
import { authRouter } from '../src/modules/auth/auth.routes';
import { usersRouter } from '../src/modules/users/users.routes';
import { rolesRouter } from '../src/modules/roles/roles.routes';
import { permissionsRouter } from '../src/modules/permissions/permissions.routes';
import { customersRouter } from '../src/modules/customers/customers.routes';
import { categoriesRouter } from '../src/modules/categories/categories.routes';
import { productsRouter } from '../src/modules/products/products.routes';
import { inventoryRouter } from '../src/modules/inventory/inventory.routes';
import { suppliersRouter } from '../src/modules/suppliers/suppliers.routes';
import { purchaseOrdersRouter } from '../src/modules/purchase-orders/purchase-orders.routes';
import { cartRouter } from '../src/modules/cart/cart.routes';
import { wishlistRouter } from '../src/modules/wishlist/wishlist.routes';
import { checkoutRouter } from '../src/modules/checkout/checkout.routes';
import { abandonedCheckoutRouter } from '../src/modules/abandoned-checkout/abandoned-checkout.routes';
import { siteSettingsRouter } from '../src/modules/site-settings/site-settings.routes';
import { bannersRouter, publicBannersRouter } from '../src/modules/banners/banners.routes';
import { pagesRouter, publicPagesRouter } from '../src/modules/pages/pages.routes';
import { ordersRouter, adminOrdersRouter } from '../src/modules/orders/orders.routes';
import { paymentsRouter, adminPaymentsRouter } from '../src/modules/payments/payments.routes';
import { adminFraudRouter } from '../src/modules/fraud-detection/fraud.routes';
import { shippingRouter, adminShippingRouter } from '../src/modules/shipping/shipping.routes';
import {
  adminCouponsRouter,
  adminFlashSalesRouter,
  publicFlashSalesRouter,
} from '../src/modules/coupons/coupons.routes';
import { customerReturnsRouter, adminReturnsRouter } from '../src/modules/returns/returns.routes';
import { adminRefundsRouter } from '../src/modules/refunds/refunds.routes';
import { adminExpensesRouter } from '../src/modules/expenses/expenses.routes';
import { adminAnalyticsRouter } from '../src/modules/analytics/analytics.routes';
import { adminReportsRouter } from '../src/modules/reports/reports.routes';
import { internalJobsRouter } from '../src/modules/internal/internal-jobs.routes';
import {
  customerNotificationsRouter,
  adminNotificationsRouter,
} from '../src/modules/notifications/notifications.routes';
import { healthRouter } from '../src/routes/health.routes';
import { swaggerDocument } from '../src/docs/swagger';

export interface RouteEntry {
  method: string;
  path: string;
  openApiPath: string;
}

export function expressToOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
}

export function getAllRegisteredEndpoints(): RouteEntry[] {
  const mounts: { prefix: string; router: Router }[] = [
    { prefix: '/api/v1', router: healthRouter },
    { prefix: '/api/v1/internal', router: internalJobsRouter },
    { prefix: '/api/v1/auth', router: authRouter },
    { prefix: '/api/v1/users', router: usersRouter },
    { prefix: '/api/v1/roles', router: rolesRouter },
    { prefix: '/api/v1/permissions', router: permissionsRouter },
    { prefix: '/api/v1/customers', router: customersRouter },
    { prefix: '/api/v1/categories', router: categoriesRouter },
    { prefix: '/api/v1/products', router: productsRouter },
    { prefix: '/api/v1/inventory', router: inventoryRouter },
    { prefix: '/api/v1/suppliers', router: suppliersRouter },
    { prefix: '/api/v1/purchase-orders', router: purchaseOrdersRouter },
    { prefix: '/api/v1/cart', router: cartRouter },
    { prefix: '/api/v1/wishlist', router: wishlistRouter },
    { prefix: '/api/v1/checkout', router: checkoutRouter },
    { prefix: '/api/v1/abandoned-checkouts', router: abandonedCheckoutRouter },
    { prefix: '/api/v1/settings', router: siteSettingsRouter },
    { prefix: '/api/v1/banners', router: bannersRouter },
    { prefix: '/api/v1/public/banners', router: publicBannersRouter },
    { prefix: '/api/v1/pages', router: pagesRouter },
    { prefix: '/api/v1/public/pages', router: publicPagesRouter },
    { prefix: '/api/v1/admin/orders', router: adminOrdersRouter },
    { prefix: '/api/v1/orders', router: ordersRouter },
    { prefix: '/api/v1/admin/payments', router: adminPaymentsRouter },
    { prefix: '/api/v1/payments', router: paymentsRouter },
    { prefix: '/api/v1/admin/fraud', router: adminFraudRouter },
    { prefix: '/api/v1/shipping', router: shippingRouter },
    { prefix: '/api/v1/admin/shipping', router: adminShippingRouter },
    { prefix: '/api/v1/admin/coupons', router: adminCouponsRouter },
    { prefix: '/api/v1/admin/flash-sales', router: adminFlashSalesRouter },
    { prefix: '/api/v1/flash-sales', router: publicFlashSalesRouter },
    { prefix: '/api/v1/admin/returns', router: adminReturnsRouter },
    { prefix: '/api/v1', router: customerReturnsRouter },
    { prefix: '/api/v1/admin/refunds', router: adminRefundsRouter },
    { prefix: '/api/v1/admin/expenses', router: adminExpensesRouter },
    { prefix: '/api/v1/admin/analytics', router: adminAnalyticsRouter },
    { prefix: '/api/v1/admin/reports', router: adminReportsRouter },
    { prefix: '/api/v1/notifications', router: customerNotificationsRouter },
    { prefix: '/api/v1/admin/notifications', router: adminNotificationsRouter },
  ];

  const endpoints: RouteEntry[] = [];
  const seen = new Set<string>();

  // Direct app routes
  const directRoutes = [
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/api/v1/public/site-config' },
    { method: 'PATCH', path: '/api/v1/admin/shipments/:id/status' },
  ];

  for (const dr of directRoutes) {
    const openApiPath = expressToOpenApiPath(dr.path);
    const key = `${dr.method} ${openApiPath}`;
    seen.add(key);
    endpoints.push({ method: dr.method, path: dr.path, openApiPath });
  }

  for (const { prefix, router } of mounts) {
    const stack = (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] })
      .stack;
    if (!stack) continue;

    for (const layer of stack) {
      if (layer.route) {
        const rawPath = layer.route.path;
        const fullPath = prefix + (rawPath === '/' ? '' : rawPath);
        const openApiPath = expressToOpenApiPath(fullPath);
        const methods = Object.keys(layer.route.methods)
          .filter(m => layer.route.methods[m])
          .map(m => m.toUpperCase());

        for (const method of methods) {
          const key = `${method} ${openApiPath}`;
          if (!seen.has(key)) {
            seen.add(key);
            endpoints.push({ method, path: fullPath, openApiPath });
          }
        }
      }
    }
  }

  return endpoints;
}

export function checkOpenApiCoverage(): {
  totalEndpoints: number;
  documentedCount: number;
  undocumentedRoutes: RouteEntry[];
} {
  const allEndpoints = getAllRegisteredEndpoints();
  const swaggerPaths = swaggerDocument.paths as Record<string, Record<string, unknown>>;

  const documentedOperations = new Set<string>();
  for (const [pathKey, methodsObj] of Object.entries(swaggerPaths)) {
    for (const methodKey of Object.keys(methodsObj)) {
      documentedOperations.add(`${methodKey.toUpperCase()} ${pathKey}`);
    }
  }

  const undocumentedRoutes: RouteEntry[] = [];
  let documentedCount = 0;

  for (const ep of allEndpoints) {
    const key = `${ep.method} ${ep.openApiPath}`;
    if (documentedOperations.has(key)) {
      documentedCount++;
    } else {
      undocumentedRoutes.push(ep);
    }
  }

  return {
    totalEndpoints: allEndpoints.length,
    documentedCount,
    undocumentedRoutes,
  };
}

if (require.main === module) {
  const result = checkOpenApiCoverage();

  console.info('================ OPENAPI SPECIFICATION COVERAGE ================');
  console.info(`Total Express Endpoints Defined: ${result.totalEndpoints}`);
  console.info(`Documented OpenAPI Operations  : ${result.documentedCount}`);
  console.info(`Undocumented Operations        : ${result.undocumentedRoutes.length}`);
  console.info('----------------------------------------------------------------');

  if (result.undocumentedRoutes.length > 0) {
    console.error(`❌ Found ${result.undocumentedRoutes.length} undocumented routes:`);
    for (const r of result.undocumentedRoutes) {
      console.error(`   - ${r.method.padEnd(6)} ${r.openApiPath}`);
    }
    console.info('----------------------------------------------------------------');
    process.exit(1);
  } else {
    console.info('✅ 100% OpenAPI Coverage achieved! Zero undocumented endpoints.');
    process.exit(0);
  }
}
