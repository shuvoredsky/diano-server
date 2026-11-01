import { vi } from 'vitest';
import { generateAccessToken } from '@/utils/jwt.util';
import { authRepository } from '@/modules/auth/auth.repository';
import { permissionsCache } from '@/modules/permissions/permissions.cache';

export interface TestAuthOptions {
  userId?: string;
  email?: string;
  roles?: string[];
  sessionId?: string;
  allowAllPermissions?: boolean;
}

export interface TestAuthContext {
  token: string;
  userId: string;
  email: string;
  roles: string[];
  sessionId: string;
  authHeader: string;
}

/**
 * Shared test factory: creates an authenticated JWT token and sets up session & permission mocks.
 * Eliminates repetitive boilerplate across all controller unit tests.
 */
export function setupTestAuth(options: TestAuthOptions = {}): TestAuthContext {
  const userId = options.userId ?? 'test-admin-id';
  const email = options.email ?? 'admin@diano.com';
  const roles = options.roles ?? ['SUPER_ADMIN'];
  const sessionId = options.sessionId ?? `session-${userId}`;
  const allowAllPermissions = options.allowAllPermissions ?? true;

  const token = generateAccessToken({
    userId,
    sessionId,
    email,
    roles,
  });

  vi.spyOn(authRepository, 'findSessionById').mockResolvedValue({
    id: sessionId,
    userId,
    tokenHash: 'mock-session-hash',
    deviceCategory: 'DESKTOP',
    browser: 'Chrome',
    os: 'Windows',
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (allowAllPermissions) {
    vi.spyOn(permissionsCache, 'hasPermission').mockResolvedValue(true);
  }

  return {
    token,
    userId,
    email,
    roles,
    sessionId,
    authHeader: `Bearer ${token}`,
  };
}
