import type { Request, Response, NextFunction } from 'express';
import { getAllowedOrigins, env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';

/**
 * Validates Origin/Referer header for cookie-based mutations to prevent CSRF
 */
export const verifyCookieOrigin = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (env.NODE_ENV === 'test') {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowedOrigins = getAllowedOrigins();

  // Allow requests without Origin if Sec-Fetch-Site indicates same-origin
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    return next();
  }

  if (origin) {
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return next();
    }
    return next(new AppError('Cross-Site Request Forgery (CSRF) origin verification failed', 403));
  }

  if (referer) {
    const isRefererAllowed = allowedOrigins.some(allowed => referer.startsWith(allowed));
    if (isRefererAllowed) {
      return next();
    }
    return next(new AppError('Cross-Site Request Forgery (CSRF) referer verification failed', 403));
  }

  // Non-browser or server-to-server requests without cookie credentials can proceed
  next();
};
