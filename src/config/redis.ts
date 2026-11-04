import { logger } from '@/utils/logger';

/**
 * Redis client stub.
 * Per project decision (docs/AGENT_RULES.md): Redis is disabled on Render free tier.
 * Notification uses Postgres outbox queue, Socket.IO is single-instance in-memory.
 */
export const redisClient = null;

/**
 * Checks Redis health safely without crashing.
 * Returns healthy/disabled status when Redis is deferred.
 */
export const checkRedisHealth = async (): Promise<{ isConnected: boolean; message: string }> => {
  return { isConnected: true, message: 'Redis is disabled (Postgres outbox queue active)' };
};

/**
 * Cleanly disconnects Redis on shutdown (no-op when Redis is disabled).
 */
export const disconnectRedis = async (): Promise<void> => {
  logger.info('Redis shutdown handler invoked (no active Redis connection)');
};
