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

export class PrismaAuditService implements IAuditService {
  async record(params: AuditLogParams): Promise<void> {
    try {
      // Filter out any potential sensitive fields from metadata
      const sanitizedMeta = { ...(params.metadata ?? {}) };
      delete sanitizedMeta.password;
      delete sanitizedMeta.token;
      delete sanitizedMeta.secret;
      delete sanitizedMeta.authorization;

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
