import type { Role, RoleType, Permission } from '@prisma/client';

export type RoleWithPermissions = Role & {
  rolePermissions: Array<{
    permission: Permission;
  }>;
};

export interface RoleSummaryItem {
  id: string;
  name: string;
  slug: string;
  type: RoleType;
  description: string | null;
  isSystem: boolean;
  permissionsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleDetailItem {
  id: string;
  name: string;
  slug: string;
  type: RoleType;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{
    id: string;
    name: string;
    slug: string;
    resource: string;
    action: string;
    description: string | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoleInput {
  name: string;
  slug: string;
  description?: string;
  permissionSlugs?: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
}

export interface AssignPermissionsInput {
  permissionSlugs: string[];
}

export interface IRolesRepository {
  findAllRoles(): Promise<RoleWithPermissions[]>;
  findRoleById(id: string): Promise<RoleWithPermissions | null>;
  findRoleBySlug(slug: string): Promise<RoleWithPermissions | null>;
  findRoleByName(name: string): Promise<RoleWithPermissions | null>;
  createRole(data: {
    name: string;
    slug: string;
    description?: string;
    permissionSlugs?: string[];
  }): Promise<RoleWithPermissions>;
  updateRole(id: string, data: { name?: string; description?: string }): Promise<RoleWithPermissions>;
  deleteRole(id: string): Promise<void>;
  setRolePermissions(roleId: string, permissionSlugs: string[]): Promise<RoleWithPermissions>;
  countUsersWithRole(roleId: string): Promise<number>;
}
