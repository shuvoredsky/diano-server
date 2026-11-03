import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env, getAllowedOrigins } from '@/config/env.config';
import { httpLogger } from '@/utils/logger';
import { requestIdMiddleware } from '@/middlewares/request-id.middleware';
import { baseRateLimiter } from '@/middlewares/rate-limiter.middleware';
import { notFoundMiddleware } from '@/middlewares/not-found.middleware';
import { errorMiddleware } from '@/middlewares/error.middleware';
import { rootRouter } from '@/routes';
import { setupSwagger } from '@/docs/swagger';

const app = express();

// Trust Render reverse proxy (1 hop) so req.ip and rate limiters receive real client IP
app.set('trust proxy', 1);

// Request logging with Pino
app.use(httpLogger);

// Security Headers
app.use(helmet());

// CORS Configuration
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'Idempotency-Key',
      'x-cart-token',
      'x-checkout-secret',
      'x-jobs-secret',
    ],
    exposedHeaders: ['x-request-id', 'x-cart-token', 'x-checkout-secret'],
  }),
);

// Response compression
app.use(compression());

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie Parser
app.use(cookieParser(env.COOKIE_SECRET));

// Request Tracking ID
app.use(requestIdMiddleware);

// Base Rate Limiter
app.use(baseRateLimiter);

// Lightweight root health check for reverse proxy / Render liveness probe (never touches DB)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'UP',
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    appName: env.APP_NAME,
  });
});

// API Version 1 Routes
app.use(env.API_PREFIX, rootRouter);

// Static file serving for local uploads (development)
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Swagger API Documentation (non-production only)
setupSwagger(app);

// 404 Route Handler
app.use(notFoundMiddleware);

// Centralized Error Handler
app.use(errorMiddleware);

export { app };
