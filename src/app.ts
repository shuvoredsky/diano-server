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
import {
  prototypePollutionGuard,
  parameterPollutionGuard,
  requestTimeoutAndSlowLogger,
} from '@/middlewares/security-guard.middleware';
import { rootRouter } from '@/routes';
import { setupSwagger } from '@/docs/swagger';

const app = express();

// Trust Render reverse proxy (1 hop) so req.ip and rate limiters receive real client IP
app.set('trust proxy', 1);

// Slow request warning and socket timeout
app.use(requestTimeoutAndSlowLogger);

// Request logging with Pino
app.use(httpLogger);

// Enhanced Security Headers (Helmet)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts:
      env.NODE_ENV === 'production'
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    hidePoweredBy: true,
    xFrameOptions: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);

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

// Body Parsers: 1mb limit for JSON and urlencoded to prevent payload flood attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Prototype Pollution and Parameter Pollution Guards
app.use(prototypePollutionGuard);
app.use(parameterPollutionGuard);

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

// Static file serving for local uploads (development only)
if (env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
}

// Swagger API Documentation (non-production only)
setupSwagger(app);

// 404 Route Handler
app.use(notFoundMiddleware);

// Centralized Error Handler
app.use(errorMiddleware);

export { app };
