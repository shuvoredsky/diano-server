import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { app } from '@/app';
import { initSocketServer, closeSocketServer } from '@/sockets/socket.server';
import { eventBus } from '@/events/event-bus';
import { generateAccessToken } from '@/utils/jwt.util';
import { authRepository } from '@/modules/auth/auth.repository';
import { createTestSuperAdminAuth, createTestCustomerAuth } from './test-auth-helper';

describe('Socket.IO Real-Time Integration Tests', () => {
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  let adminAuth: { token: string; userId: string; sessionId: string };
  let customerAuth: { token: string; userId: string; sessionId: string };

  beforeAll(async () => {
    adminAuth = await createTestSuperAdminAuth();
    customerAuth = await createTestCustomerAuth();

    server = http.createServer(app);
    initSocketServer(server);

    await new Promise<void>(resolve => {
      server.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          serverPort = addr.port;
          serverUrl = `http://localhost:${serverPort}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await closeSocketServer();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('rejects connection without token during handshake', async () => {
    let connectError: Error | null = null;

    const socket: ClientSocket = ioClient(serverUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    await new Promise<void>(resolve => {
      socket.on('connect_error', err => {
        connectError = err;
        socket.disconnect();
        resolve();
      });
      socket.on('connect', () => {
        socket.disconnect();
        resolve();
      });
    });

    expect(connectError).not.toBeNull();
    expect(connectError!.message).toContain('Missing access token');
  });

  it('rejects connection with invalid JWT token', async () => {
    let connectError: Error | null = null;

    const socket: ClientSocket = ioClient(serverUrl, {
      auth: { token: 'invalid.token.signature' },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    await new Promise<void>(resolve => {
      socket.on('connect_error', err => {
        connectError = err;
        socket.disconnect();
        resolve();
      });
      socket.on('connect', () => {
        socket.disconnect();
        resolve();
      });
    });

    expect(connectError).not.toBeNull();
    expect(connectError!.message).toContain('Invalid or expired token');
  });

  it('rejects connection if session is revoked in database', async () => {
    // Generate valid JWT but point to revoked session ID
    const revokedSessionToken = generateAccessToken({
      userId: customerAuth.userId,
      email: 'revoked@diano.com',
      roles: ['customer'],
      sessionId: 'non-existent-revoked-session',
    });

    let connectError: Error | null = null;

    const socket: ClientSocket = ioClient(serverUrl, {
      auth: { token: revokedSessionToken },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    await new Promise<void>(resolve => {
      socket.on('connect_error', err => {
        connectError = err;
        socket.disconnect();
        resolve();
      });
      socket.on('connect', () => {
        socket.disconnect();
        resolve();
      });
    });

    expect(connectError).not.toBeNull();
    expect(connectError!.message).toContain('Session revoked or expired');
  });

  it('authenticates customer client and receives order:status, but NOT admin order:new', async () => {
    const customerSocket: ClientSocket = ioClient(serverUrl, {
      auth: { token: customerAuth.token },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      customerSocket.on('connect', resolve);
      customerSocket.on('connect_error', reject);
    });

    let receivedOrderStatus: any = null;
    let receivedOrderNew: any = null;

    customerSocket.on('order:status', data => {
      receivedOrderStatus = data;
    });

    customerSocket.on('order:new', data => {
      receivedOrderNew = data;
    });

    // 1. Emit order:new (for admin only)
    eventBus.emitDomainEvent({
      id: 'evt_new_order_1',
      type: 'order:new',
      orderNumber: 'ORD-SEC-001',
      totalAmount: 1500,
      summary: 'New order ORD-SEC-001 placed',
      timestamp: new Date().toISOString(),
    });

    // 2. Emit order:status for this specific customer
    eventBus.emitDomainEvent({
      id: 'evt_order_status_1',
      type: 'order:status',
      orderId: 'ord-123',
      orderNumber: 'ORD-SEC-001',
      status: 'CONFIRMED',
      userId: customerAuth.userId,
      summary: 'Your order is confirmed',
      timestamp: new Date().toISOString(),
    });

    await new Promise(r => setTimeout(r, 200));

    // Customer receives their own order:status
    expect(receivedOrderStatus).not.toBeNull();
    expect(receivedOrderStatus.orderNumber).toBe('ORD-SEC-001');
    expect(receivedOrderStatus.status).toBe('CONFIRMED');

    // Customer MUST NOT receive admin order:new event
    expect(receivedOrderNew).toBeNull();

    customerSocket.disconnect();
  });

  it('authenticates admin client and receives admin room events (order:new) with minimal payload', async () => {
    const adminSocket: ClientSocket = ioClient(serverUrl, {
      auth: { token: adminAuth.token },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      adminSocket.on('connect', resolve);
      adminSocket.on('connect_error', reject);
    });

    let adminReceivedNew: any = null;

    adminSocket.on('order:new', data => {
      adminReceivedNew = data;
    });

    eventBus.emitDomainEvent({
      id: 'evt_admin_test_1',
      type: 'order:new',
      orderNumber: 'ORD-ADMIN-002',
      totalAmount: 9800,
      summary: 'High value order ORD-ADMIN-002',
      timestamp: new Date().toISOString(),
    });

    await new Promise(r => setTimeout(r, 200));

    expect(adminReceivedNew).not.toBeNull();
    expect(adminReceivedNew.orderNumber).toBe('ORD-ADMIN-002');
    expect(adminReceivedNew.totalAmount).toBe(9800);
    // Minimal payload verification: no customer address, payment details, or phone
    expect(adminReceivedNew.customerEmail).toBeUndefined();
    expect(adminReceivedNew.shippingAddress).toBeUndefined();

    adminSocket.disconnect();
  });

  it('blocks client-initiated arbitrary room joins with error message', async () => {
    const customerSocket: ClientSocket = ioClient(serverUrl, {
      auth: { token: customerAuth.token },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      customerSocket.on('connect', resolve);
      customerSocket.on('connect_error', reject);
    });

    let socketError: any = null;
    customerSocket.on('error', err => {
      socketError = err;
    });

    // Client attempts unauthorized join
    customerSocket.emit('join', 'admin:all');

    await new Promise(r => setTimeout(r, 200));

    expect(socketError).not.toBeNull();
    expect(socketError.message).toContain('Client-initiated room manipulation is not permitted');

    customerSocket.disconnect();
  });
});

