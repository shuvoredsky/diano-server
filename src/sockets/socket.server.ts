import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { getAllowedOrigins } from '@/config/env.config';
import { verifyAccessToken } from '@/utils/jwt.util';
import { authRepository } from '@/modules/auth/auth.repository';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { logger } from '@/utils/logger';
import {
  eventBus,
  type OrderNewEvent,
  type OrderStatusEvent,
  type PaymentStatusEvent,
  type StockLowEvent,
  type CheckoutAbandonedEvent,
  type FraudReviewEvent,
  type NotificationNewEvent,
} from '@/events/event-bus';
import type { SocketData, SocketUserPayload } from './socket.types';

let ioInstance: SocketIOServer | null = null;
const userConnections = new Map<string, number>();
const MAX_CONCURRENT_PER_USER = 5;
const MAX_MESSAGES_PER_WINDOW = 10;
const RATE_WINDOW_MS = 10000;

export function getSocketServer(): SocketIOServer | null {
  return ioInstance;
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  if (ioInstance) {
    return ioInstance;
  }

  const allowedOrigins = getAllowedOrigins();

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 20000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6, // 1MB payload ceiling
  });

  // 1. Handshake Authentication Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const rawToken =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization as string | undefined);

      if (!rawToken) {
        return next(new Error('Authentication error: Missing access token'));
      }

      const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim();

      // Verify JWT
      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch {
        return next(new Error('Authentication error: Invalid or expired token'));
      }

      // Verify active session state in database
      const session = await authRepository.findSessionById(decoded.sessionId);
      if (!session || session.isRevoked || session.expiresAt < new Date()) {
        return next(new Error('Authentication error: Session revoked or expired'));
      }

      // Check max concurrent connections per user
      const currentCount = userConnections.get(decoded.userId) || 0;
      if (currentCount >= MAX_CONCURRENT_PER_USER) {
        return next(new Error('Connection limit error: Maximum concurrent connections reached'));
      }

      // Fetch user's role permissions
      const perms = await permissionsCache.getRolePermissions(decoded.roles);
      const userPayload: SocketUserPayload = {
        ...decoded,
        permissions: Array.from(perms),
      };

      socket.data = {
        user: userPayload,
        messageTimestamps: [],
      } as SocketData;

      next();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      next(new Error(msg));
    }
  });

  // 2. Connection Lifecycle & Room Assignment
  io.on('connection', async (socket: Socket) => {
    const user = (socket.data as SocketData).user;
    const userId = user.userId;

    // Track active connection
    userConnections.set(userId, (userConnections.get(userId) || 0) + 1);
    logger.debug({ userId, socketId: socket.id }, '[Socket.IO] Client connected');

    // Assign server-controlled rooms
    // Customer private room
    await socket.join(`user:${userId}`);

    // Admin rooms
    const isStaff =
      user.roles.includes('super-admin') ||
      user.roles.includes('SUPER_ADMIN') ||
      user.roles.includes('admin') ||
      user.roles.includes('ADMIN');

    if (isStaff) {
      await socket.join('admin:all');

      // Add permission-specific rooms
      if (user.permissions && user.permissions.length > 0) {
        for (const perm of user.permissions) {
          await socket.join(`admin:perm:${perm}`);
        }
      }

      // Super admins automatically get all essential administrative rooms
      if (user.roles.includes('super-admin') || user.roles.includes('SUPER_ADMIN')) {
        await socket.join('admin:perm:order:read');
        await socket.join('admin:perm:order:manage');
        await socket.join('admin:perm:inventory:manage');
        await socket.join('admin:perm:fraud:manage');
        await socket.join('admin:perm:shipping:manage');
      }
    }

    // 3. Security: Block client-initiated arbitrary room joins & rate limit incoming messages
    socket.use(([event, ..._args], next) => {
      const data = socket.data as SocketData;
      const now = Date.now();

      // Filter timestamps outside rolling rate window
      data.messageTimestamps = (data.messageTimestamps || []).filter(t => now - t < RATE_WINDOW_MS);

      if (data.messageTimestamps.length >= MAX_MESSAGES_PER_WINDOW) {
        socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
        return next(new Error('Rate limit exceeded'));
      }

      data.messageTimestamps.push(now);

      // Block client trying to join rooms
      if (event === 'join' || event === 'subscribe' || event.startsWith('room:')) {
        socket.emit('error', { message: 'Client-initiated room manipulation is not permitted' });
        return next(new Error('Forbidden: Arbitrary room joining is blocked'));
      }

      next();
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      const active = userConnections.get(userId) || 1;
      if (active <= 1) {
        userConnections.delete(userId);
      } else {
        userConnections.set(userId, active - 1);
      }
      logger.debug({ userId, socketId: socket.id }, '[Socket.IO] Client disconnected');
    });
  });

  // 4. Wire internal event bus to Socket.IO broadcasts
  eventBus.on('order:new', (event: OrderNewEvent) => {
    io.to('admin:perm:order:read').to('admin:all').emit('order:new', {
      id: event.id,
      type: 'order:new',
      orderNumber: event.orderNumber,
      totalAmount: event.totalAmount,
      summary: event.summary,
      timestamp: event.timestamp,
    });
  });

  eventBus.on('order:status', (event: OrderStatusEvent) => {
    const payload = {
      id: event.id,
      type: 'order:status',
      orderNumber: event.orderNumber,
      status: event.status,
      summary: event.summary,
      timestamp: event.timestamp,
    };

    io.to('admin:perm:order:read').emit('order:status', payload);
    if (event.userId) {
      io.to(`user:${event.userId}`).emit('order:status', payload);
    }
  });

  eventBus.on('payment:status', (event: PaymentStatusEvent) => {
    const payload = {
      id: event.id,
      type: 'payment:status',
      paymentId: event.paymentId,
      status: event.status,
      summary: event.summary,
      timestamp: event.timestamp,
    };

    io.to('admin:perm:order:read').emit('payment:status', payload);
    if (event.userId) {
      io.to(`user:${event.userId}`).emit('payment:status', payload);
    }
  });

  eventBus.on('stock:low', (event: StockLowEvent) => {
    io.to('admin:perm:inventory:manage').to('admin:all').emit('stock:low', {
      id: event.id,
      type: 'stock:low',
      variantId: event.variantId,
      available: event.available,
      threshold: event.threshold,
      summary: event.summary,
      timestamp: event.timestamp,
    });
  });

  eventBus.on('checkout:abandoned', (event: CheckoutAbandonedEvent) => {
    io.to('admin:perm:order:read').to('admin:all').emit('checkout:abandoned', {
      id: event.id,
      type: 'checkout:abandoned',
      sessionId: event.sessionId,
      summary: event.summary,
      timestamp: event.timestamp,
    });
  });

  eventBus.on('fraud:review', (event: FraudReviewEvent) => {
    io.to('admin:perm:fraud:manage').to('admin:all').emit('fraud:review', {
      id: event.id,
      type: 'fraud:review',
      orderId: event.orderId,
      score: event.score,
      riskTier: event.riskTier,
      summary: event.summary,
      timestamp: event.timestamp,
    });
  });

  eventBus.on('notification:new', (event: NotificationNewEvent) => {
    const payload = {
      id: event.id,
      type: 'notification:new',
      notificationId: event.notificationId,
      summary: event.summary,
      template: event.template,
      timestamp: event.timestamp,
    };

    if (event.userId) {
      io.to(`user:${event.userId}`).emit('notification:new', payload);
    } else {
      io.to('admin:all').emit('notification:new', payload);
    }
  });

  ioInstance = io;
  return io;
}

export function closeSocketServer(): Promise<void> {
  return new Promise(resolve => {
    if (ioInstance) {
      ioInstance.close(() => {
        ioInstance = null;
        userConnections.clear();
        resolve();
      });
    } else {
      resolve();
    }
  });
}

