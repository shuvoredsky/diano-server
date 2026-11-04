import http from 'http';
import { app } from '../src/app';
import { pgPool } from '../src/config/database';

interface BenchmarkResult {
  endpoint: string;
  totalRequests: number;
  concurrency: number;
  successful: number;
  failed: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

async function runConcurrencyBenchmark(
  serverPort: number,
  endpoint: string,
  method = 'GET',
  headers: Record<string, string> = {},
  totalRequests = 100,
  concurrency = 20,
): Promise<BenchmarkResult> {
  const durations: number[] = [];
  let completed = 0;
  let successful = 0;
  let failed = 0;

  return new Promise(resolve => {
    let currentInFlight = 0;
    let dispatched = 0;

    function dispatchNext(): void {
      if (completed >= totalRequests) {
        durations.sort((a, b) => a - b);
        const avgMs = durations.reduce((sum, d) => sum + d, 0) / (durations.length || 1);
        const p50Ms = durations[Math.floor(durations.length * 0.5)] || 0;
        const p95Ms = durations[Math.floor(durations.length * 0.95)] || 0;
        const maxMs = durations[durations.length - 1] || 0;

        resolve({
          endpoint,
          totalRequests,
          concurrency,
          successful,
          failed,
          avgMs: Math.round(avgMs * 10) / 10,
          p50Ms: Math.round(p50Ms * 10) / 10,
          p95Ms: Math.round(p95Ms * 10) / 10,
          maxMs: Math.round(maxMs * 10) / 10,
        });
        return;
      }

      while (currentInFlight < concurrency && dispatched < totalRequests) {
        dispatched++;
        currentInFlight++;
        const startTime = Date.now();

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: endpoint,
            method,
            headers: {
              ...headers,
              Connection: 'keep-alive',
            },
          },
          res => {
            res.on('data', () => {});
            res.on('end', () => {
              const duration = Date.now() - startTime;
              durations.push(duration);
              if (res.statusCode && res.statusCode < 500) {
                successful++;
              } else {
                failed++;
              }
              currentInFlight--;
              completed++;
              dispatchNext();
            });
          },
        );

        req.on('error', () => {
          durations.push(Date.now() - startTime);
          failed++;
          currentInFlight--;
          completed++;
          dispatchNext();
        });

        req.end();
      }
    }

    dispatchNext();
  });
}

export async function runPerfSmoke(): Promise<void> {
  console.info('🚀 Starting Local Performance Smoke & Query Plan Benchmark...');

  // 1. Start ephemeral HTTP server for benchmarking
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  console.info(`⚡ Ephemeral test server active on port ${port}`);

  try {
    // Run benchmarks
    const endpointsToTest = [
      { name: 'GET /health', path: '/health' },
      { name: 'GET /api/v1/health', path: '/api/v1/health' },
      { name: 'GET /api/v1/products?limit=10', path: '/api/v1/products?limit=10' },
      { name: 'GET /api/v1/products/featured', path: '/api/v1/products/featured' },
      { name: 'GET /api/v1/cart', path: '/api/v1/cart', headers: { 'x-cart-token': 'smoke-perf-cart' } },
    ];

    console.info('\n📊 Concurrency Benchmark Results (Concurrency: 20, 100 requests each):');
    console.info('----------------------------------------------------------------------');
    for (const ep of endpointsToTest) {
      const res = await runConcurrencyBenchmark(port, ep.path, 'GET', ep.headers, 100, 20);
      console.info(
        `• ${res.endpoint.padEnd(35)} | Success: ${res.successful}/${res.totalRequests} | p50: ${res.p50Ms}ms | p95: ${res.p95Ms}ms | max: ${res.maxMs}ms`,
      );
    }

    // 2. EXPLAIN query analysis on top 5 queries
    console.info('\n🔍 EXPLAIN Index Usage on Top 5 Critical Queries:');
    console.info('----------------------------------------------------------------------');

    const explainQueries = [
      {
        name: '1. Catalog Product Search with Trigram / Filter',
        sql: `EXPLAIN SELECT id, name, slug, status FROM "Product" WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 10`,
      },
      {
        name: '2. Product Detail by Unique Slug',
        sql: `EXPLAIN SELECT id, slug, name FROM "Product" WHERE slug = 'sample-product-slug'`,
      },
      {
        name: '3. Customer Orders Filtered by Customer ID',
        sql: `EXPLAIN SELECT id, "orderNumber", "grandTotal", status FROM "Order" WHERE "customerId" = 'cust-sample' ORDER BY "createdAt" DESC LIMIT 10`,
      },
      {
        name: '4. Admin Orders Filtered by Status & Date Range',
        sql: `EXPLAIN SELECT id, "orderNumber", status FROM "Order" WHERE status = 'PENDING' ORDER BY "createdAt" DESC LIMIT 20`,
      },
      {
        name: '5. Stock Movement Ledger by Variant',
        sql: `EXPLAIN SELECT id, type, quantity FROM "StockMovement" WHERE "variantId" = 'sample-var' ORDER BY "createdAt" DESC LIMIT 50`,
      },
    ];

    for (const eq of explainQueries) {
      try {
        const result = await pgPool.query(eq.sql);
        console.info(`\n${eq.name}:`);
        for (const row of result.rows) {
          console.info(`   ${row['QUERY PLAN']}`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`   Could not explain query '${eq.name}': ${message}`);
      }
    }
  } finally {
    server.close();
    await pgPool.end();
  }
}

if (require.main === module) {
  runPerfSmoke().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}
