export interface AuditLogActorSummary {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogItemDto {
  id: string;
  actorId: string | null;
  actorType: string;
  actor: AuditLogActorSummary | null;
  action: string;
  targetType: string;
  targetId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditLogListQuery {
  page: number;
  limit: number;
  actor?: string;
  actorId?: string;
  actorType?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedAuditLogsResult {
  items: AuditLogItemDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

