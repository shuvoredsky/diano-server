import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/modules/auth/auth.service';
import type { IAuthRepository } from '@/modules/auth/auth.types';
import { authenticate } from '@/middlewares/auth.middleware';
import { authRepository } from '@/modules/auth/auth.repository';
import { generateAccessToken } from '@/utils/jwt.util';
import { AppError } from '@/utils/app-error';

describe('Session Revocation & Redis Decoupling (Unit Tests)', () => {
  let mockAuthRepo: Partial<IAuthRepository>;
  let authService: AuthService;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockAuthRepo = {
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
      revokeRefreshTokenFamily: vi.fn().mockResolvedValue(undefined),
      findRefreshTokenByHash: vi.fn().mockResolvedValue({
        id: 'rt-1',
        tokenHash: 'hash-1',
        userId: 'u-1',
        familyId: 'family-1',
        sessionId: 'sess-1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
      }),
      findSessionById: vi.fn(),
    };

    const mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    const mockEmailSvc = {
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      mockAuthRepo as IAuthRepository,
      mockEmailSvc as unknown as Parameters<typeof AuthService.prototype['constructor']>[1],
      mockAuditSvc as unknown as Parameters<typeof AuthService.prototype['constructor']>[2],
    );
  });

  it('should revoke current session and token family in DB without requiring Redis', async () => {
    await authService.logout('raw-refresh-token', 'sess-1');

    expect(mockAuthRepo.findRefreshTokenByHash).toHaveBeenCalled();
    expect(mockAuthRepo.revokeRefreshTokenFamily).toHaveBeenCalledWith('family-1');
    expect(mockAuthRepo.revokeSession).toHaveBeenCalledWith('sess-1');
  });

  it('should revoke all user sessions in DB as single source of truth without Redis', async () => {
    await authService.logoutAll('user-123');

    expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith('user-123');
  });

  it('should reject request when session is marked isRevoked in DB regardless of Redis state', async () => {
    const token = generateAccessToken({
      userId: 'user-1',
      sessionId: 'revoked-session',
      roles: ['CUSTOMER'],
      email: 'customer@example.com',
    });

    vi.spyOn(authRepository, 'findSessionById').mockResolvedValue({
      id: 'revoked-session',
      userId: 'user-1',
      deviceInfo: null,
      ipAddress: null,
      userAgent: null,
      isRevoked: true, // Marked revoked in DB
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = { headers: { authorization: `Bearer ${token}` } } as Partial<Request>;
    const res = {} as Partial<Response>;
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = (next as unknown as { mock: { calls: Array<[AppError]> } }).mock.calls[0]?.[0];
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toContain('Session has been revoked or expired');
  });

  it('should authenticate active session using DB repository even if Redis is completely unavailable', async () => {
    const token = generateAccessToken({
      userId: 'user-2',
      sessionId: 'active-session',
      roles: ['CUSTOMER'],
      email: 'customer@example.com',
    });

    vi.spyOn(authRepository, 'findSessionById').mockResolvedValue({
      id: 'active-session',
      userId: 'user-2',
      deviceInfo: null,
      ipAddress: null,
      userAgent: null,
      isRevoked: false,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = { headers: { authorization: `Bearer ${token}` } } as Partial<Request>;
    const res = {} as Partial<Response>;
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request).user?.userId).toBe('user-2');
    expect((req as Request).user?.sessionId).toBe('active-session');
  });
});
