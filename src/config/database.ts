import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';

const activeDbUrl =
  env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL
    : env.DATABASE_URL;

export const pgPool = new Pool({
  connectionString: activeDbUrl,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: 30000,
  max: env.DB_POOL_MAX,
});

// Suppress unhandled pool error events when Postgres is offline
pgPool.on('error', err => {
  if (env.NODE_ENV !== 'test') {
    logger.warn({ error: err.message }, 'PostgreSQL pool connection warning');
  }
});

const adapter = new PrismaPg(pgPool);

// Prevent multiple instances in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Checks PostgreSQL database connection health safely with retry for Neon cold starts/idle disconnects
 */
export const checkDatabaseHealth = async (
  retries = 2,
  delayMs = 1000,
): Promise<{ isConnected: boolean; message: string }> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const client = await pgPool.connect();
      try {
        await client.query('SELECT 1');
        return { isConnected: true, message: 'Database connection is healthy' };
      } finally {
        client.release();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown database error';
      if (attempt < retries) {
        if (env.NODE_ENV !== 'test') {
          logger.warn(
            { attempt: attempt + 1, error: errorMsg },
            'Retrying database connection (handling possible Neon cold start/idle disconnect)...',
          );
        }
        await new Promise(res => setTimeout(res, delayMs * Math.pow(2, attempt)));
      } else {
        return { isConnected: false, message: `Database disconnected: ${errorMsg}` };
      }
    }
  }
  return { isConnected: false, message: 'Database connection failed after retries' };
};

/**
 * Cleanly disconnects Prisma on shutdown
 */
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    await pgPool.end();
    logger.info('Database disconnected cleanly');
  } catch (error) {
    logger.error({ error }, 'Error disconnecting database');
  }
};
