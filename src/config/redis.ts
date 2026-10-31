import Redis from 'ioredis';
import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';

// Create Redis client with lazy connection to avoid crashing when Redis is not running
export const redisClient = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  retryStrategy: () => null, // Do not auto-retry continuously when Redis is offline
});

// Suppress unhandled error events to avoid process crash
redisClient.on('error', err => {
  if (env.NODE_ENV !== 'test') {
    logger.warn({ error: err.message }, 'Redis connection warning');
  }
});

/**
 * Checks Redis health safely without crashing
 */
export const checkRedisHealth = async (): Promise<{ isConnected: boolean; message: string }> => {
  try {
    if (redisClient.status !== 'ready') {
      await redisClient.connect();
    }
    const ping = await redisClient.ping();
    if (ping === 'PONG') {
      return { isConnected: true, message: 'Redis connection is healthy' };
    }
    return { isConnected: false, message: `Unexpected Redis ping response: ${ping}` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown Redis error';
    return { isConnected: false, message: `Redis disconnected: ${errorMsg}` };
  }
};

/**
 * Cleanly disconnects Redis on shutdown
 */
export const disconnectRedis = async (): Promise<void> => {
  try {
    if (redisClient.status === 'ready' || redisClient.status === 'connecting') {
      await redisClient.quit();
      logger.info('Redis disconnected cleanly');
    }
  } catch (error) {
    logger.error({ error }, 'Error disconnecting Redis');
  }
};
