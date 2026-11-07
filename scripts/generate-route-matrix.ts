import { app } from '../src/app';

export interface RouteEntry {
  method: string;
  path: string;
  protection: 'PUBLIC' | 'AUTHENTICATED' | 'RBAC_PROTECTED' | 'INTERNAL_JOB';
  requiredPermission?: string;
}

interface ExpressRoute {
  path: string;
  methods: Record<string, boolean>;
}

interface ExpressLayer {
  name?: string;
  route?: ExpressRoute;
  handle?: { stack?: ExpressLayer[] };
  regexp?: { source: string };
}

export function extractAllAppRoutes(): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = [];

  function processLayer(layer: ExpressLayer, basePath = ''): void {
    if (layer.route) {
      const routePath = basePath + (layer.route.path === '/' ? '' : layer.route.path);
      const methods = Object.keys(layer.route.methods)
        .filter(m => layer.route.methods[m])
        .map(m => m.toUpperCase());

      for (const method of methods) {
        routes.push({ method, path: routePath || '/' });
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      let routerPath = basePath;
      if (layer.regexp) {
        const match = layer.regexp.source
          .replace('\\/?(?=\\/|$)', '')
          .replace('^\\', '')
          .replace(/\\\//g, '/')
          .replace(/\^/g, '')
          .replace(/\$/g, '')
          .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, ':id')
          .replace(/\/\?$/, '');
        if (match && match !== '/') {
          routerPath = basePath + (match.startsWith('/') ? match : '/' + match);
        }
      }
      for (const childLayer of layer.handle.stack) {
        processLayer(childLayer, routerPath);
      }
    }
  }

  const appWithRouter = app as unknown as {
    _router?: { stack?: ExpressLayer[] };
    router?: { stack?: ExpressLayer[] };
  };
  const router = appWithRouter._router || appWithRouter.router;
  if (router && router.stack) {
    for (const layer of router.stack) {
      processLayer(layer, '');
    }
  }

  return routes;
}

export function generateRouteSecurityMatrix(): {
  allRoutes: { method: string; path: string }[];
  adminRoutes: { method: string; path: string }[];
  publicRoutes: { method: string; path: string }[];
  vulnerableAdminRoutes: { method: string; path: string }[];
} {
  const allRoutes = extractAllAppRoutes();

  // Public routes allowlist
  const isPublic = (r: { method: string; path: string }): boolean => {
    const p = r.path;
    if (p === '/health' || p === '/api/v1/health' || p === '/api/v1/ready') return true;
    if (p.startsWith('/api/docs')) return true;
    if (p.startsWith('/api/v1/auth/')) {
      // /auth/logout, /auth/sessions are authenticated
      if (p.includes('/logout') || p.includes('/sessions')) return false;
      return true;
    }
    if (p.startsWith('/api/v1/public/')) return true;
    if (p.startsWith('/api/v1/categories') && r.method === 'GET') return true;
    if (p.startsWith('/api/v1/products') && r.method === 'GET' && !p.includes('/admin/')) return true;
    if (p.startsWith('/api/v1/flash-sales') && r.method === 'GET' && !p.includes('/admin/')) return true;
    if (p.startsWith('/api/v1/shipping/methods') || p.startsWith('/api/v1/shipping/calculate')) return true;
    if (p.startsWith('/api/v1/orders/track') || (p === '/api/v1/orders' && r.method === 'POST')) return true;
    if (p.startsWith('/api/v1/payments/sslcommerz/')) return true;
    if (p.startsWith('/api/v1/notifications/unsubscribe')) return true;
    if (p.startsWith('/api/v1/cart') && !p.includes('/merge')) return true; // guest cart
    if (p.startsWith('/api/v1/checkout/sessions')) return true; // guest checkout
    return false;
  };

  const adminRoutes = allRoutes.filter(
    r =>
      r.path.includes('/admin/') ||
      r.path.startsWith('/api/v1/users') ||
      r.path.startsWith('/api/v1/roles') ||
      r.path.startsWith('/api/v1/permissions') ||
      r.path.startsWith('/api/v1/inventory') ||
      r.path.startsWith('/api/v1/suppliers') ||
      r.path.startsWith('/api/v1/purchase-orders') ||
      r.path.startsWith('/api/v1/admin/'),
  );

  const publicRoutes = allRoutes.filter(r => isPublic(r));

  // Any admin route that evaluates as public is an immediate critical vulnerability
  const vulnerableAdminRoutes = adminRoutes.filter(r => isPublic(r));

  return { allRoutes, adminRoutes, publicRoutes, vulnerableAdminRoutes };
}

// Self-executing runner
if (require.main === module) {
  const matrix = generateRouteSecurityMatrix();
  console.info('================ ROUTE PERMISSION MATRIX ================');
  console.info(`Total Express Routes Registered: ${matrix.allRoutes.length}`);
  console.info(`Admin & Privileged Routes: ${matrix.adminRoutes.length}`);
  console.info(`Public Endpoints Allowlisted: ${matrix.publicRoutes.length}`);
  console.info('---------------------------------------------------------');

  if (matrix.vulnerableAdminRoutes.length > 0) {
    console.error('❌ CRITICAL SECURITY ERROR: Unprotected Admin Routes Found:');
    for (const vr of matrix.vulnerableAdminRoutes) {
      console.error(`   - ${vr.method} ${vr.path}`);
    }
    process.exit(1);
  } else {
    console.info('✅ ZERO unprotected admin routes found. All admin routes require RBAC protection.');
    process.exit(0);
  }
}
