import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/utils/app-error';
import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';

export interface FormattedErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: unknown;
  stack?: string;
  timestamp: string;
  requestId?: string;
}

export const errorMiddleware = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response => {
  let statusCode = 500;
  let message = 'Internal server error';
  let errors: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    errors = err.issues.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token expired';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.message;
  }

  // Log server errors or unhandled operational warnings
  if (statusCode >= 500) {
    logger.error({
      err,
      requestId: req.id ? String(req.id) : undefined,
      url: req.originalUrl,
      method: req.method,
    }, 'Unhandled server error');
  }

  const payload: FormattedErrorResponse = {
    success: false,
    statusCode,
    message,
    ...(errors !== undefined && { errors }),
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
    timestamp: new Date().toISOString(),
    ...(req.id && { requestId: String(req.id) }),
  };

  return res.status(statusCode).json(payload);
};
