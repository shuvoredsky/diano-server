import { describe, it, expect } from 'vitest';
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  type AccessTokenPayload,
} from '@/utils/jwt.util';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env.config';

describe('JWT Util', () => {
  const mockPayload: AccessTokenPayload = {
    userId: 'user_cuid_123',
    sessionId: 'session_cuid_456',
    roles: ['CUSTOMER'],
    email: 'test@example.com',
  };

  it('should sign and verify valid access tokens', () => {
    const token = generateAccessToken(mockPayload);
    expect(token).toBeDefined();

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(mockPayload.userId);
    expect(decoded.sessionId).toBe(mockPayload.sessionId);
    expect(decoded.roles).toEqual(mockPayload.roles);
    expect(decoded.email).toBe(mockPayload.email);
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('should reject invalid or malformed tokens', () => {
    expect(() => verifyAccessToken('malformed.token.string')).toThrowError(
      'Invalid access token',
    );
  });

  it('should reject tokens signed with a different secret', () => {
    const forgedToken = jwt.sign(mockPayload, 'wrong-secret-key-12345', { expiresIn: '15m' });
    expect(() => verifyAccessToken(forgedToken)).toThrowError('Invalid access token');
  });

  it('should reject expired tokens', () => {
    const expiredToken = jwt.sign(mockPayload, env.JWT_ACCESS_SECRET, { expiresIn: '-1s' });
    expect(() => verifyAccessToken(expiredToken)).toThrowError('Access token has expired');
  });

  it('should generate opaque refresh token and matching SHA-256 hash', () => {
    const { token, hash } = generateRefreshToken();
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(60); // 48 bytes = 96 hex characters
    expect(hash).toBeDefined();
    expect(hash).toHaveLength(64); // SHA-256 hash
  });
});
