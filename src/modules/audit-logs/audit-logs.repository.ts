import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';

export interface AuditLogFilterParams {
  page: number;
  limit: number;
  actor?: string;
  actorId?: string;
  actorType?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  fromDate?: Date;
  toDate?: Date;
  sortOrder: 'asc' | 'desc';
}

export interface AuditLogRecordWithActor {
  id: string;
  actorId: string | null;
  actorType: string;
  action: string;
  targetType: string;
  targetId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface IAuditLogsRepository {
  findMany(params: AuditLogFilterParams): Promise<{
    items: AuditLogRecordWithActor[];
    total: number;
  }>;
  findById(id: string): Promise<AuditLogRecordWithActor | null>;
}

export class PrismaAuditLogsRepository implements IAuditLogsRepository {
  async findMany(params: AuditLogFilterParams): Promise<{
    items: AuditLogRecordWithActor[];
    total: number;
  }> {
    const where: Prisma.AuditLogWhereInput = {};

    const effectiveActor = params.actorId || params.actor;
    if (effectiveActor) {
      if (params.actorId && !params.actor) {
        where.actorId = params.actorId;
      } else {
        const matchedUsers = await prisma.user.findMany({
          where: {
            OR: [
              { id: effectiveActor },
              { email: { contains: effectiveActor, mode: 'insensitive' } },
              { name: { contains: effectiveActor, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
          take: 50,
        });
        const matchedIds = matchedUsers.map(u => u.id);
        if (! matchedIds.includes(effectiveActor)) {
          matchedIds.push(effectiveActor);
        }
        where.actorId = { in: matchedIds };
      }
    }

    if (params.actorType) {
      where.actorType = params.actorType;
    }

    if (params.action) {
      where.action = { contains: params.action, mode: 'insensitive' };
    }

    if (params.targetType) {
      where.targetType = { equals: params.targetType, mode: 'insensitive' };
    }

    if (params.targetId) {
      where.targetId = params.targetId;
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) {
        where.createdAt.gte = params.fromDate;
      }
      if (params.toDate) {
        where.createdAt.lt = params.toDate;
      }
    }

    const skip = (params.page - 1) * params.limit;

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: params.sortOrder },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const actorIds = Array.from(
      new Set(rows.map(r => r.actorId).filter((id): id is string => Boolean(id))),
    );

    const actorsMap = new Map<string, { id: string; name: string; email: string }>();
    if (actorIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      });
      for (const u of users) {
        actorsMap.set(u.id, u);
      }
    }

    const items: AuditLogRecordWithActor[] = rows.map(row => ({
      ...row,
      actor: row.actorId ? (actorsMap.get(row.actorId) ?? null) : null,
    }));

    return { items, total };
  }

  async findById(id: string): Promise<AuditLogRecordWithActor | null> {
    const row = await prisma.auditLog.findUnique({
      where: { id },
    });
    if (!row) return null;

    let actor: { id: string; name: string; email: string } | null = null;
    if (row.actorId) {
      actor = await prisma.user.findUnique({
        where: { id: row.actorId },
        select: { id: true, name: true, email: true },
      });
    }

    return {
      ...row,
      actor,
    };
  }
}

export const auditLogsRepository = new PrismaAuditLogsRepository();
