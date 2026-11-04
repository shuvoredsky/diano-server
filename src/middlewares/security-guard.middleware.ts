import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/app-error';
import { logger } from '@/utils/logger';

const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_OBJECT_DEPTH = 10;

/**
 * Checks for prototype pollution keys recursively and validates nesting depth.
 */
function validateObjectSafety(obj: unknown, depth = 0): void {
  if (depth > MAX_OBJECT_DEPTH) {
    throw new AppError('JSON payload nesting depth exceeds allowable limit (max 10 levels)', 400);
  }

  if (obj === null || typeof obj !== 'object') {
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      validateObjectSafety(item, depth + 1);
    }
    return;
  }

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (FORBIDDEN_PROPERTIES.has(key)) {
      throw new AppError(`Illegal property detected in payload: ${key}`, 400);
    }
    validateObjectSafety((obj as Record<string, unknown>)[key], depth + 1);
  }
}

/**
 * Prototype pollution and payload depth protection middleware.
 */
export const prototypePollutionGuard = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    if (req.body && typeof req.body === 'object') {
      validateObjectSafety(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      validateObjectSafety(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      validateObjectSafety(req.params);
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * HTTP Parameter Pollution (HPP) Guard:
 * When query parameters receive repeated array values (e.g. ?sort=asc&sort=desc)
 * for standard single-value parameters, picks the first value to prevent array pollution attacks.
 */
export const parameterPollutionGuard = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.query && typeof req.query === 'object') {
    for (const [key, value] of Object.entries(req.query)) {
      // Allow specific array query params like 'status', 'tags', 'ids'
      const allowedArrayParams = new Set(['status', 'tags', 'ids', 'categoryIds', 'warehouseIds']);
      if (Array.isArray(value) && !allowedArrayParams.has(key)) {
        // Retain only the first parameter
        (req.query as Record<string, unknown>)[key] = value[0];
      }
    }
  }
  next();
};

/**
 * Request timeout and slow request detection middleware.
 * Warns in logs when any request takes > 1000ms.
 */
export const requestTimeoutAndSlowLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = req.id ? String(req.id) : req.headers['x-request-id'] || 'unknown';

  // Enforce 30s socket timeout
  req.setTimeout(30000, () => {
    logger.error({ requestId, method: req.method, url: req.originalUrl }, 'Request socket timeout (30s)');
  });

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    if (durationMs > 1000) {
      logger.warn(
        {
          requestId,
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          durationMs,
        },
        `⚠️ SLOW REQUEST: ${req.method} ${req.originalUrl} completed in ${durationMs}ms (> 1000ms threshold)`,
      );
    }
  });

  next();
};

