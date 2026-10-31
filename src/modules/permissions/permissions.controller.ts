import type { Request, Response } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { permissionsService, type PermissionsService } from './permissions.service';

export class PermissionsController {
  constructor(private readonly service: PermissionsService = permissionsService) {}

  listPermissions = async (_req: Request, res: Response): Promise<Response> => {
    const grouped = await this.service.getGroupedPermissions();
    return ApiResponse.success(res, 'Permissions retrieved successfully', grouped);
  };
}

export const permissionsController = new PermissionsController();
