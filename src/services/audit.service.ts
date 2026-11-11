import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import type { Prisma } from '@prisma/client';

export interface AuditLogParams {
  actorId?: string;
  actorType: 'USER' | 'SYSTEM' | 'GUEST' | 'WEBHOOK';
  action: string;
  targetType: string;
  targetId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface IAuditService {
  record(params: AuditLogParams): Promise<void>;
}

const SENSITIVE_METADATA_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'oldpassword',
  'token',
  'tokenhash',
  'refreshtoken',
  'accesstoken',
  'secret',
  'clientsecret',
  'checkoutsecret',
  'authorization',
  'cookie',
  'set-cookie',
  'cvv',
  'cardnumber',
  'apikey',
  'privatekey',
  'otp',
]);

/**
 * Recursively strips any sensitive credentials, tokens, or secrets from audit metadata.
 */
export function sanitizeAuditMetadata(
  input: unknown,
  depth = 0,
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || depth > 6) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
    if (
      SENSITIVE_METADATA_KEYS.has(normalizedKey) ||
      normalizedKey.includes('password') ||
      normalizedKey.includes('secret') ||
      normalizedKey.includes('token') ||
      normalizedKey.includes('authorization')
    ) {
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = sanitizeAuditMetadata(value, depth + 1);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? sanitizeAuditMetadata(item, depth + 1)
          : item,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Masks IP address for non-privileged viewers while preserving full IP for super-admin / security admins.
 */
export function maskAuditIp(
  ip: string | null | undefined,
  canViewFullIp = false,
): string | null {
  if (!ip) return null;
  if (canViewFullIp) return ip;

  const trimmed = ip.trim();
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
    }
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length > 2) {
      return `${parts.slice(0, 2).join(':')}:****`;
    }
  }
  return '***';
}

export class PrismaAuditService implements IAuditService {
  async record(params: AuditLogParams): Promise<void> {
    try {
      // Filter out any potential sensitive fields from metadata recursively
      const sanitizedMeta = sanitizeAuditMetadata(params.metadata);

      await prisma.auditLog.create({
        data: {
          actorId: params.actorId,
          actorType: params.actorType,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          requestId: params.requestId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          metadata: sanitizedMeta as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Audit log failures must never crash the main transaction
      logger.warn({ error, action: params.action }, 'Failed to persist audit log entry');
    }
  }
}

export const auditService: IAuditService = new PrismaAuditService();

export interface ActorContext {
  userId?: string;
  email?: string;
  actorType?: 'USER' | 'SYSTEM' | 'GUEST' | 'WEBHOOK';
}

/**
 * Standardized audit helper that verifies actor attribution and records audit log safely
 */
export const recordAuditSafe = async (
  auditSvc: IAuditService,
  actor: ActorContext | undefined,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> => {
  if (!actor?.userId && actor?.actorType !== 'SYSTEM' && actor?.actorType !== 'WEBHOOK') {
    return;
  }
  await auditSvc.record({
    actorId: actor?.userId,
    actorType: actor?.actorType ?? 'USER',
    action,
    targetType,
    targetId,
    metadata,
  });
};
