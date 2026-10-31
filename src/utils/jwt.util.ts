import jwt from 'jsonwebtoken';
import { env } from '@/config/env.config';
import { generateRandomToken, hashToken } from './token.util';
import { AppError } from './app-error';

export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
  roles: string[];
  email: string;
}

export interface DecodedAccessToken extends AccessTokenPayload {
  iat: number;
  exp: number;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
}

/**
 * Signs a short-lived JSON Web Token for API authentication.
 */
export const generateAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

/**
 * Verifies and decodes an access token.
 */
export const verifyAccessToken = (token: string): DecodedAccessToken => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as DecodedAccessToken;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw AppError.unauthorized('Invalid access token');
    }
    throw error;
  }
};

/**
 * Generates an opaque refresh token and its SHA-256 hash.
 * Only the SHA-256 hash is ever persisted in the database.
 */
export const generateRefreshToken = (): { token: string; hash: string } => {
  const token = generateRandomToken(48);
  const hash = hashToken(token);
  return { token, hash };
};
