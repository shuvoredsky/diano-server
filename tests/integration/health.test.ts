import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import * as dbConfig from '@/config/database';
import * as redisConfig from '@/config/redis';

describe('Health and Readiness Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/health (Liveness Probe)', () => {
    it('should return 200 and UP status without requiring database or redis', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        statusCode: 200,
        message: 'Server is alive',
        data: {
          status: 'UP',
        },
      });
      expect(response.body.data).toHaveProperty('uptimeSeconds');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.headers).toHaveProperty('x-request-id');
    });
  });

  describe('GET /api/v1/ready (Readiness Probe)', () => {
    it('should return 503 when dependencies (DB or Redis) are disconnected', async () => {
      vi.spyOn(dbConfig, 'checkDatabaseHealth').mockResolvedValue({
        isConnected: false,
        message: 'Database connection failed',
      });
      vi.spyOn(redisConfig, 'checkRedisHealth').mockResolvedValue({
        isConnected: false,
        message: 'Redis connection failed',
      });

      const response = await request(app).get('/api/v1/ready');

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 503,
        message: 'Service unavailable: Dependencies not ready',
        data: {
          database: { status: 'disconnected' },
          redis: { status: 'disconnected' },
        },
      });
    });

    it('should return 200 when both database and redis are healthy', async () => {
      vi.spyOn(dbConfig, 'checkDatabaseHealth').mockResolvedValue({
        isConnected: true,
        message: 'Database connection is healthy',
      });
      vi.spyOn(redisConfig, 'checkRedisHealth').mockResolvedValue({
        isConnected: true,
        message: 'Redis connection is healthy',
      });

      const response = await request(app).get('/api/v1/ready');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        statusCode: 200,
        message: 'All dependencies are healthy and ready',
        data: {
          database: { status: 'connected' },
          redis: { status: 'connected' },
        },
      });
    });
  });

  describe('404 Route Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/api/v1/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
      });
    });
  });
});
