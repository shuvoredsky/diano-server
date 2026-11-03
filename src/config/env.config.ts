import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('localhost'),
  API_PREFIX: z.string().default('/api/v1'),
  APP_NAME: z.string().default('diano-server'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:5173'),

  // Database and Redis URLs
  DATABASE_URL: z.string().optional().default('postgresql://diano:diano_dev_password@localhost:5432/diano_dev?schema=public'),
  TEST_DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional().default('redis://localhost:6379'),
  REDIS_HOST: z.string().optional().default('localhost'),
  REDIS_PORT: z.coerce.number().optional().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // JWT & Secrets - must be strong
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_RESET_PASSWORD_SECRET: z
    .string()
    .min(32, 'JWT_RESET_PASSWORD_SECRET must be at least 32 characters long'),
  JWT_RESET_PASSWORD_EXPIRES_IN: z.string().default('1h'),
  COOKIE_SECRET: z
    .string()
    .min(32, 'COOKIE_SECRET must be at least 32 characters long'),

  // Password & Security Parameters
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(16).default(12),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().int().positive().default(15),

  // Rate Limiter
  RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().positive().default(100),

  // Business Defaults
  DEFAULT_CURRENCY: z.string().default('BDT'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Dhaka'),
  ORDER_PAYMENT_TIMEOUT_HOURS: z.coerce.number().positive().default(24),
  ORDER_RETURN_WINDOW_DAYS: z.coerce.number().positive().default(7),
  ORDER_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  // External Integrations (Optional)
  STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  MAX_IMAGE_SIZE_MB: z.coerce.number().positive().default(2),
  MAX_FILE_SIZE_BYTES: z.coerce.number().positive().default(2 * 1024 * 1024),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional().default('noreply@diano.com'),

  // Payment Gateway Configuration
  PAYMENT_ENABLED_PROVIDERS: z.string().default('COD,SSLCOMMERZ'),
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_IS_LIVE: z.preprocess(val => val === 'true' || val === true, z.boolean()).default(false),
  BACKEND_PUBLIC_URL: z.string().default('http://localhost:5000'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Render & Cross-Site Deployment Additions
  CLIENT_URL: z.string().optional(),
  ADMIN_URL: z.string().optional(),
  JOBS_SECRET: z.string().min(32, 'JOBS_SECRET must be at least 32 characters long').optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().positive().default(30000),
  DIRECT_URL: z.string().optional(),
}).superRefine((data, ctx) => {
  const enabled = (data.PAYMENT_ENABLED_PROVIDERS || 'COD,SSLCOMMERZ')
    .split(',')
    .map(p => p.trim().toUpperCase())
    .filter(Boolean);

  const validProviders = ['COD', 'SSLCOMMERZ'];
  for (const p of enabled) {
    if (!validProviders.includes(p)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid payment provider '${p}' in PAYMENT_ENABLED_PROVIDERS. Only COD and SSLCOMMERZ are supported.`,
        path: ['PAYMENT_ENABLED_PROVIDERS'],
      });
    }
  }

  if (enabled.includes('SSLCOMMERZ') && data.NODE_ENV !== 'test') {
    if (!data.SSLCOMMERZ_STORE_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SSLCOMMERZ_STORE_ID is required when SSLCOMMERZ is enabled',
        path: ['SSLCOMMERZ_STORE_ID'],
      });
    }
    if (!data.SSLCOMMERZ_STORE_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SSLCOMMERZ_STORE_PASSWORD is required when SSLCOMMERZ is enabled',
        path: ['SSLCOMMERZ_STORE_PASSWORD'],
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

export const validateEnv = (customEnv: Record<string, unknown> = process.env): EnvConfig => {
  const result = envSchema.safeParse(customEnv);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map(err => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`[Env Validation Error] Missing or invalid environment variables: ${errorDetails}`);
  }

  // Production check: warn if Cloudinary credentials missing (fail upload on demand)
  if (
    result.data.NODE_ENV === 'production' &&
    (!result.data.CLOUDINARY_CLOUD_NAME || !result.data.CLOUDINARY_API_KEY || !result.data.CLOUDINARY_API_SECRET)
  ) {
    console.warn(
      '[Env Warning] Cloudinary credentials are missing in production. Media uploads will fail with 503 Service Unavailable.',
    );
  }

  return result.data;
};

// Singleton validated env instance
export const env = validateEnv();

// Helper to get allowed CORS origins as an array
export const getAllowedOrigins = (): string[] => {
  const origins = new Set<string>();
  if (env.CORS_ORIGINS) {
    env.CORS_ORIGINS.split(',').forEach(origin => {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    });
  }
  if (env.CLIENT_URL) origins.add(env.CLIENT_URL.trim());
  if (env.ADMIN_URL) origins.add(env.ADMIN_URL.trim());
  if (env.FRONTEND_URL) origins.add(env.FRONTEND_URL.trim());
  return Array.from(origins);
};
