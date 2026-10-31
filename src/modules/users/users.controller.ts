import type { Request, Response } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { usersService, type UsersService } from './users.service';
import {
  listUsersQuerySchema,
  createAdminUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from './users.validation';

export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  private extractActorMeta(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id ? String(req.id) : undefined,
    };
  }

  listUsers = async (req: Request, res: Response): Promise<Response> => {
    const query = listUsersQuerySchema.parse(req.query);
    const result = await this.service.listUsers(query);
    return ApiResponse.paginated(res, 'Users retrieved successfully', result.items, result.meta);
  };

  getUserById = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const user = await this.service.getUserById(id);
    return ApiResponse.success(res, 'User retrieved successfully', user);
  };

  createUser = async (req: Request, res: Response): Promise<Response> => {
    const input = createAdminUserSchema.parse(req.body);
    const meta = this.extractActorMeta(req);
    const user = await this.service.createAdminUser(input, req.user!, meta);
    return ApiResponse.created(res, 'Administrative account created successfully', user);
  };

  updateUser = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const input = updateUserSchema.parse(req.body);
    const meta = this.extractActorMeta(req);
    const user = await this.service.updateUser(id, input, req.user!, meta);
    return ApiResponse.success(res, 'User updated successfully', user);
  };

  updateUserStatus = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const input = updateUserStatusSchema.parse(req.body);
    const meta = this.extractActorMeta(req);
    const user = await this.service.updateUserStatus(id, input, req.user!, meta);
    return ApiResponse.success(res, `User status updated to ${input.status}`, user);
  };

  deleteUser = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const meta = this.extractActorMeta(req);
    await this.service.deleteUser(id, req.user!, meta);
    return ApiResponse.success(res, 'User account deactivated successfully');
  };

  revokeUserSessions = async (req: Request, res: Response): Promise<Response> => {
    const id = req.params.id as string;
    const meta = this.extractActorMeta(req);
    await this.service.revokeUserSessions(id, req.user!, meta);
    return ApiResponse.success(res, 'User sessions revoked successfully');
  };
}

export const usersController: UsersController = new UsersController();
