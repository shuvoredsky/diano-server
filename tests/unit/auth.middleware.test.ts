import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  authenticate,
  optionalAuthenticate,
  authorize,
  requirePermission,
} from '@/middlewares/auth.middleware';
import { generateAccessToken } from '@/utils/jwt.util';
import { authRepository } from '@/modules/auth/auth.repository';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { AppError } from '@/utils/app-error';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env.config';

describe('Auth & RBAC Middlewares (Unit Tests)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: Mock;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {};
    next = vi.fn();
    vi.restoreAllMocks();
  });

  describe('authenticate middleware', () => {
    it('should reject request when Authorization header is missing', async () => {
      await authenticate(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0]?.[0] as AppError;
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Authentication token missing');
    });

    it('should reject request when Authorization header does not start with Bearer', async () => {
      req.headers = { authorization: 'Basic 123456' };

      await authenticate(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0]?.[0] as AppError;
      expect(error.statusCode).toBe(401);
    });

    it('should reject expired access token', async () => {
      const expiredToken = jwt.sign(
        { userId: 'u1', sessionId: 's1', roles: ['CUSTOMER'], email: 'u@example.com' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '-1s' },
      );
      req.headers = { authorization: `Bearer ${expiredToken}` };

      await authenticate(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0]?.[0] as AppError;
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Access token has expired');
    });

    it('should reject when session is revoked in database', async () => {
      const validToken = generateAccessToken({
        userId: 'u1',
        sessionId: 's1',
        roles: ['CUSTOMER'],
        email: 'u@example.com',
      });
      req.headers = { authorization: `Bearer ${validToken}` };

      vi.spyOn(authRepository, 'findSessionById').mockResolvedValue({
        id: 's1',
        userId: 'u1',
        tokenHash: 'h',
        deviceCategory: 'DESKTOP',
        browser: null,
        os: null,
        ip: null,
        userAgent: null,
        isRevoked: true, // REVOKED
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await authenticate(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0]?.[0] as AppError;
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Session has been revoked');
    });

    it('should authenticate successfully with valid token and active session', async () => {
      const validToken = generateAccessToken({
        userId: 'u1',
        sessionId: 's1',
        roles: ['CUSTOMER'],
        email: 'u@example.com',
      });
      req.headers = { authorization: `Bearer ${validToken}` };

      vi.spyOn(authRepository, 'findSessionById').mockResolvedValue({
        id: 's1',
        userId: 'u1',
        tokenHash: 'h',
        deviceCategory: 'DESKTOP',
        browser: null,
        os: null,
        ip: null,
        userAgent: null,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await authenticate(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user?.userId).toBe('u1');
      expect(req.user?.sessionId).toBe('s1');
    });
  });

  describe('optionalAuthenticate middleware', () => {
    it('should proceed without error if no authorization header is provided', async () => {
      await optionalAuthenticate(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeUndefined();
    });

    it('should attach user if valid token and session provided', async () => {
      const validToken = generateAccessToken({
        userId: 'u1',
        sessionId: 's1',
        roles: ['CUSTOMER'],
        email: 'u@example.com',
      });
      req.headers = { authorization: `Bearer ${validToken}` };

      vi.spyOn(authRepository, 'findSessionById').mockResolvedValue({
        id: 's1',
        userId: 'u1',
        tokenHash: 'h',
        deviceCategory: 'DESKTOP',
        browser: null,
        os: null,
        ip: null,
        userAgent: null,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await optionalAuthenticate(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
      expect(req.user?.userId).toBe('u1');
    });
  });

  describe('authorize middleware', () => {
    it('should deny unauthenticated requests with 401', () => {
      const middleware = authorize('admin');
      middleware(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0]?.[0] as AppError;
      expect(error.statusCode).toBe(401);
    });

    it('should allow user with matching role', () => {
      req.user = {
        userId: 'u1',
        sessionId: 's1',
        roles: ['admin', 'manager'],
        email: 'admin@example.com',
      };

      const middleware = authorize('admin', 'super-admin');
      middleware(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
    });

    it('should allow super-admin unconditionally', () => {
      req.user = {
        userId: 'u1',
        sessionId: 's1',
        roles: ['super-admin'],
        email: 'super@example.com',
      };

      const middleware = authorize('inventory-manager');
      middleware(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject customer token on admin-only route with 403 Forbidden', () => {
      req.user = {
        userId: 'u1',
        sessionId: 's1',
        roles: ['customer'],
        email: 'customer@example.com',
      };

      const middleware = authorize('admin', 'manager', 'super-admin');
      middleware(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0]?.[0] as AppError;
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Insufficient role permissions');
    });
  });

  describe('requirePermission middleware', () => {
    it('should allow user with required permission', async () => {
      req.user = {
        userId: 'u1',
        sessionId: 's1',
        roles: ['manager'],
        email: 'manager@example.com',
      };

      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);

      const middleware = requirePermission('products:create');
      await middleware(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject user lacking required permission with 403 Forbidden', async () => {
      req.user = {
        userId: 'u1',
        sessionId: 's1',
        roles: ['support-staff'],
        email: 'support@example.com',
      };

      vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(false);

      const middleware = requirePermission('settings:update');
      await middleware(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0]?.[0] as AppError;
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Missing required permission');
    });

    it('should bypass permission check for super-admin', async () => {
      req.user = {
        userId: 'u1',
        sessionId: 's1',
        roles: ['super-admin'],
        email: 'super@example.com',
      };

      // permissionsCache already returns true for super-admin
      const middleware = requirePermission('anything:destructive');
      await middleware(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
    });
  });
});
