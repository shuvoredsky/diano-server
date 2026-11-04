import type { Server } from 'http';
import { app } from '@/app';
import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';
import { disconnectDatabase } from '@/config/database';
import { disconnectRedis } from '@/config/redis';
import { initSocketServer, closeSocketServer } from '@/sockets/socket.server';

let server: Server | null = null;
let isShuttingDown = false;

const startServer = (): void => {
  server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        prefix: env.API_PREFIX,
      },
      `🚀 ${env.APP_NAME} started successfully on port ${env.PORT}`,
    );
  });
  initSocketServer(server);
};

export const gracefulShutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

  // Force exit after 10 seconds timeout in case connections hang
  const forceExitTimeout = setTimeout(() => {
    logger.error('Shutdown timed out. Forcing process termination.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  try {
    // 0. Close Socket.IO server
    await closeSocketServer();

    // 1. Close HTTP Server
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close(err => {
          if (err) {
            logger.error({ err }, 'Error closing HTTP server');
            return reject(err);
          }
          logger.info('HTTP server closed.');
          resolve();
        });
      });
    }

    // 2. Disconnect Prisma Database safely
    await disconnectDatabase();

    // 3. Disconnect Redis safely
    await disconnectRedis();

    logger.info('Graceful shutdown completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error occurred during graceful shutdown');
    process.exit(1);
  }
};

// Process-level termination signal handlers
process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

// Uncaught exceptions & unhandled rejections
process.on('uncaughtException', error => {
  logger.error({ error }, 'Uncaught Exception detected');
  void gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  logger.error({ reason }, 'Unhandled Rejection detected');
  void gracefulShutdown('unhandledRejection');
});

// Launch server
startServer();
