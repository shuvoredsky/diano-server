import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '@/utils/jwt.util';
import { AppError } from '@/utils/app-error';
import { authRepository } from '@/modules/auth/auth.repository';
import { permissionsCache } from '@/modules/permissions/permissions.cache';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Verifies JWT Access Token and ensures the corresponding session is still active
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Authentication token missing or invalid format');
    }

    const token = authHeader.substring(7).trim();
    const payload = verifyAccessToken(token);

    // Verify session state in database / memory
    const session = await authRepository.findSessionById(payload.sessionId);
    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw AppError.unauthorized('Session has been revoked or expired. Please sign in again.');
    }

    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication - extracts user if valid token is provided, otherwise proceeds without failing
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const payload = verifyAccessToken(token);

      const session = await authRepository.findSessionById(payload.sessionId);
      if (session && !session.isRevoked && session.expiresAt >= new Date()) {
        req.user = payload;
      }
    }
  } catch {
    // Proceed without setting req.user
  }
  next();
};

/**
 * Role-Based Access Control (RBAC) middleware
 * Checks if the authenticated user has at least one of the specified roles
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    const userRoles = req.user.roles;
    const isSuperAdmin = userRoles.includes('super-admin') || userRoles.includes('SUPER_ADMIN');

    if (isSuperAdmin) {
      return next();
    }

    const hasAllowedRole = userRoles.some(role =>
      allowedRoles.some(allowed => allowed.toLowerCase() === role.toLowerCase()),
    );

    if (!hasAllowedRole) {
      return next(AppError.forbidden('Access denied. Insufficient role permissions.'));
    }

    next();
  };
};

/**
 * Granular Permission check middleware using in-memory cached role permissions
 */
export const requirePermission = (...permissionSlugs: string[]) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized('Authentication required'));
      }

      for (const slug of permissionSlugs) {
        const hasPerm = await permissionsCache.hasPermission(req.user.roles, slug);
        if (hasPerm) {
          return next();
        }
      }

      return next(
        AppError.forbidden(`Access denied: Missing required permission [${permissionSlugs.join(', ')}]`),
      );
    } catch (error) {
      next(error);
    }
  };
};
