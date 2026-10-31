import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/app-error';

export const notFoundMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};
