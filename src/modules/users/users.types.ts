import type { UserStatus } from '@prisma/client';
import type { PaginationResult, PaginatedMeta } from '@/utils/pagination';
import type { UserWithRoles } from '@/modules/auth/auth.types';

export interface UserSummaryItem {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  roles: Array<{ id: string; name: string; slug: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserQueryOptions {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: UserStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UserFilterOptions extends PaginationResult {
  search?: string;
  role?: string;
  status?: UserStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateAdminUserInput {
  email: string;
  name: string;
  phone?: string;
  roleSlug: string;
  password?: string;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  roleSlug?: string;
}

export interface UpdateUserStatusInput {
  status: UserStatus;
}

export interface PaginatedUsersResult {
  items: UserSummaryItem[];
  meta: PaginatedMeta;
}

export interface IUsersRepository {
  findUsers(filter: UserFilterOptions): Promise<{ items: UserWithRoles[]; total: number }>;
  findUserById(id: string): Promise<UserWithRoles | null>;
  findUserByEmail(email: string): Promise<UserWithRoles | null>;
  findUserByPhone(phone: string): Promise<UserWithRoles | null>;
  countActiveSuperAdmins(): Promise<number>;
  createUser(data: {
    email: string;
    name: string;
    phone?: string;
    passwordHash: string;
    roleSlug: string;
  }): Promise<UserWithRoles>;
  updateUser(id: string, data: { name?: string; phone?: string; avatarUrl?: string }): Promise<UserWithRoles>;
  updateUserStatus(id: string, status: UserStatus): Promise<UserWithRoles>;
  assignRole(userId: string, roleSlug: string): Promise<void>;
  softDeleteUser(id: string): Promise<void>;
}
