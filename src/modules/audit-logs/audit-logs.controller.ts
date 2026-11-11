import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { getPaginationMeta } from '@/utils/pagination';
import { auditLogsService, type AuditLogsService } from './audit-logs.service';
import {
  listAuditLogsQuerySchema,
  auditLogIdParamSchema,
} from './audit-logs.validation';

export class AuditLogsController {
  constructor(private readonly service: AuditLogsService = auditLogsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listAuditLogsQuerySchema.parse(req.query);
      const viewerRoles = req.user?.roles ?? [];

      const result = await this.service.listAuditLogs(query, viewerRoles);

      ApiResponse.paginated(
        res,
        'Audit logs retrieved successfully',
        result.items,
        getPaginationMeta(result.meta.total, result.meta.page, result.meta.limit),
      );
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = auditLogIdParamSchema.parse(req.params);
      const viewerRoles = req.user?.roles ?? [];

      const item = await this.service.getAuditLogById(id, viewerRoles);

      ApiResponse.success(res, 'Audit log retrieved successfully', item);
    } catch (error) {
      next(error);
    }
  };
}

export const auditLogsController = new AuditLogsController();

