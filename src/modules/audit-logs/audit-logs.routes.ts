import { Router } from 'express';
import { authenticate, requirePermission } from '@/middlewares/auth.middleware';
import { auditLogsController } from './audit-logs.controller';

export const adminAuditLogsRouter = Router();

// Read-only, append-only audit log endpoints (zero create/update/delete endpoints)
adminAuditLogsRouter.get(
  '/',
  authenticate,
  requirePermission('audit:view'),
  auditLogsController.list,
);

adminAuditLogsRouter.get(
  '/:id',
  authenticate,
  requirePermission('audit:view'),
  auditLogsController.getById,
);

