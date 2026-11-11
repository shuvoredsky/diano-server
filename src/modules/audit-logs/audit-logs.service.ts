import { AppError } from '@/utils/app-error';
import { createDhakaDate } from '@/modules/analytics/period.util';
import { sanitizeAuditMetadata, maskAuditIp } from '@/services/audit.service';
import type {
  IAuditLogsRepository,
  AuditLogRecordWithActor,
} from './audit-logs.repository';
import { auditLogsRepository } from './audit-logs.repository';
import type {
  AuditLogItemDto,
  AuditLogListQuery,
  PaginatedAuditLogsResult,
} from './audit-logs.types';

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDhakaBoundaryDate(raw: string, isEndBoundary: boolean): Date {
  const match = DATE_ONLY_REGEX.exec(raw.trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return isEndBoundary
      ? createDhakaDate(year, month, day + 1, 0, 0, 0, 0)
      : createDhakaDate(year, month, day, 0, 0, 0, 0);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw AppError.badRequest(`Invalid date filter: ${raw}. Expected YYYY-MM-DD or ISO-8601.`);
  }
  return parsed;
}

export class AuditLogsService {
  constructor(private readonly repo: IAuditLogsRepository = auditLogsRepository) {}

  private mapRecordToDto(
    record: AuditLogRecordWithActor,
    canViewFullIp: boolean,
  ): AuditLogItemDto {
    return {
      id: record.id,
      actorId: record.actorId,
      actorType: record.actorType,
      actor: record.actor
        ? {
            id: record.actor.id,
            name: record.actor.name,
            email: record.actor.email,
          }
        : null,
      action: record.action,
      targetType: record.targetType,
      targetId: record.targetId,
      requestId: record.requestId,
      ipAddress: maskAuditIp(record.ipAddress, canViewFullIp),
      userAgent: record.userAgent,
      metadata: sanitizeAuditMetadata(record.metadata),
      createdAt: record.createdAt,
    };
  }

  async listAuditLogs(
    query: AuditLogListQuery,
    viewerRoles: string[] = [],
  ): Promise<PaginatedAuditLogsResult> {
    const fromDate = query.from ? parseDhakaBoundaryDate(query.from, false) : undefined;
    const toDate = query.to ? parseDhakaBoundaryDate(query.to, true) : undefined;

    if (fromDate && toDate && fromDate > toDate) {
      throw AppError.badRequest('Date range invalid: "from" must be before or equal to "to".');
    }

    const canViewFullIp = viewerRoles.some(r => {
      const normalized = r.toLowerCase();
      return normalized === 'super-admin' || normalized === 'super_admin';
    });

    const { items, total } = await this.repo.findMany({
      page: query.page,
      limit: query.limit,
      actor: query.actor,
      actorId: query.actorId,
      actorType: query.actorType,
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId,
      fromDate,
      toDate,
      sortOrder: query.sortOrder,
    });

    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      items: items.map(item => this.mapRecordToDto(item, canViewFullIp)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  async getAuditLogById(
    id: string,
    viewerRoles: string[] = [],
  ): Promise<AuditLogItemDto> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw AppError.notFound('Audit log entry not found');
    }

    const canViewFullIp = viewerRoles.some(r => {
      const normalized = r.toLowerCase();
      return normalized === 'super-admin' || normalized === 'super_admin';
    });

    return this.mapRecordToDto(record, canViewFullIp);
  }
}

export const auditLogsService = new AuditLogsService();

