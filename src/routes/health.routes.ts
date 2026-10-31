import { Router } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { checkDatabaseHealth } from '@/config/database';
import { checkRedisHealth } from '@/config/redis';
import { asyncHandler } from '@/utils/async-handler';
import { env } from '@/config/env.config';

const router = Router();

/**
 * @route   GET /health
 * @desc    Liveness probe: verifies that the HTTP server is running and responsive
 */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    return ApiResponse.success(res, 'Server is alive', {
      status: 'UP',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      appName: env.APP_NAME,
    });
  }),
);

/**
 * @route   GET /ready
 * @desc    Readiness probe: verifies PostgreSQL and Redis connections
 */
router.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const [dbHealth, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const isReady = dbHealth.isConnected && redisHealth.isConnected;
    const services = {
      database: {
        status: dbHealth.isConnected ? 'connected' : 'disconnected',
        message: dbHealth.message,
      },
      redis: {
        status: redisHealth.isConnected ? 'connected' : 'disconnected',
        message: redisHealth.message,
      },
    };

    if (!isReady) {
      return res.status(503).json({
        success: false,
        statusCode: 503,
        message: 'Service unavailable: Dependencies not ready',
        data: services,
        timestamp: new Date().toISOString(),
      });
    }

    return ApiResponse.success(res, 'All dependencies are healthy and ready', services, 200);
  }),
);

export const healthRouter = router;
