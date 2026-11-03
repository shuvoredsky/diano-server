import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';

/**
 * Middleware protecting internal maintenance job triggers.
 * Requirements:
 * 1. JOBS_SECRET must be set and >= 32 chars in env (fails closed if unconfigured).
 * 2. Compares token with constant-time equality check to prevent timing attacks.
 * 3. Supports x-jobs-secret header or Authorization: Bearer <secret>.
 */
export function verifyJobsSecret(req: Request, _res: Response, next: NextFunction): void {
  // Fail closed if server secret is not set or too weak
  if (!env.JOBS_SECRET || env.JOBS_SECRET.length < 32) {
    return next(
      AppError.unauthorized('Internal jobs trigger is disabled: JOBS_SECRET is not configured or too short (min 32 chars).'),
    );
  }

  // Extract secret from x-jobs-secret or Authorization header
  let clientSecret: string | undefined = req.headers['x-jobs-secret'] as string | undefined;

  if (!clientSecret && req.headers.authorization?.startsWith('Bearer ')) {
    clientSecret = req.headers.authorization.substring(7).trim();
  }

  if (!clientSecret) {
    return next(AppError.unauthorized('Missing internal job authorization secret.'));
  }

  const expectedBuffer = Buffer.from(env.JOBS_SECRET, 'utf8');
  const clientBuffer = Buffer.from(clientSecret, 'utf8');

  // Length comparison first; timingSafeEqual throws if buffer lengths mismatch
  if (expectedBuffer.length !== clientBuffer.length) {
    return next(AppError.unauthorized('Invalid internal job secret.'));
  }

  if (!crypto.timingSafeEqual(expectedBuffer, clientBuffer)) {
    return next(AppError.unauthorized('Invalid internal job secret.'));
  }

  next();
}
