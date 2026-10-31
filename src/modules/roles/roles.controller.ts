import type { Request, Response } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { rolesService, type RolesService } from './roles.service';
import {
  createRoleSchema,
  updateRoleSchema,
  assignPermissionsSchema,
} from './roles.validation';

export class RolesController {
  constructor(private readonly service: RolesService = rolesService) {}

  private extractActorMeta(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id ? String(req.id) : undefined,
    };
  }

  listRoles = async (_req: Request, res: Response): Promise<Response> => {
    const roles = await this.service.listRoles();
    return ApiResponse.success(res, 'Roles retrieved successfully', roles);
  };

  getRoleById = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const role = await this.service.getRoleById(id);
    return ApiResponse.success(res, 'Role retrieved successfully', role);
  };

  createRole = async (req: Request, res: Response): Promise<Response> => {
    const input = createRoleSchema.parse(req.body);
    const meta = this.extractActorMeta(req);
    const role = await this.service.createRole(input, req.user!, meta);
    return ApiResponse.created(res, 'Role created successfully', role);
  };

  updateRole = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const input = updateRoleSchema.parse(req.body);
    const meta = this.extractActorMeta(req);
    const role = await this.service.updateRole(id, input, req.user!, meta);
    return ApiResponse.success(res, 'Role updated successfully', role);
  };

  deleteRole = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const meta = this.extractActorMeta(req);
    await this.service.deleteRole(id, req.user!, meta);
    return ApiResponse.success(res, 'Role deleted successfully');
  };

  assignPermissions = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const input = assignPermissionsSchema.parse(req.body);
    const meta = this.extractActorMeta(req);
    const role = await this.service.assignPermissions(id, input, req.user!, meta);
    return ApiResponse.success(res, 'Role permissions updated successfully', role);
  };
}

export const rolesController = new RolesController();
