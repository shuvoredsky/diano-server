import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  actor: z.string().trim().min(1).max(100).optional(),
  actorId: z.string().trim().min(1).max(100).optional(),
  actorType: z.enum(['USER', 'SYSTEM', 'GUEST', 'WEBHOOK']).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  targetType: z.string().trim().min(1).max(100).optional(),
  targetId: z.string().trim().min(1).max(100).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const auditLogIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

