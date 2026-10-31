import { AppError } from '@/utils/app-error';
import { isSystemRole, SYSTEM_ROLE_SLUGS } from '@/constants/roles';
import { permissionsCache, type PermissionsCache } from '@/modules/permissions/permissions.cache';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import type {
  IRolesRepository,
  RoleSummaryItem,
  RoleDetailItem,
  CreateRoleInput,
  UpdateRoleInput,
  AssignPermissionsInput,
  RoleWithPermissions,
} from './roles.types';
import { rolesRepository as defaultRepo } from './roles.repository';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';

export class RolesService {
  constructor(
    private readonly repo: IRolesRepository = defaultRepo,
    private readonly auditSvc: IAuditService = defaultAuditService,
    private readonly cache: PermissionsCache = permissionsCache,
  ) {}

  private isActorSuperAdmin(actor: AccessTokenPayload): boolean {
    return actor.roles.some(
      r => r.toLowerCase() === SYSTEM_ROLE_SLUGS.SUPER_ADMIN || r === 'SUPER_ADMIN',
    );
  }

  private formatRoleSummary(role: RoleWithPermissions): RoleSummaryItem {
    return {
      id: role.id,
      name: role.name,
      slug: role.slug,
      type: role.type,
      description: role.description,
      isSystem: role.isSystem,
      permissionsCount: role.rolePermissions.length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private formatRoleDetail(role: RoleWithPermissions): RoleDetailItem {
    return {
      id: role.id,
      name: role.name,
      slug: role.slug,
      type: role.type,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.rolePermissions.map(rp => ({
        id: rp.permission.id,
        name: rp.permission.name,
        slug: rp.permission.slug,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async listRoles(): Promise<RoleSummaryItem[]> {
    const roles = await this.repo.findAllRoles();
    return roles.map(r => this.formatRoleSummary(r));
  }

  async getRoleById(id: string): Promise<RoleDetailItem> {
    const role = await this.repo.findRoleById(id);
    if (!role) {
      throw AppError.notFound('Role not found');
    }
    return this.formatRoleDetail(role);
  }

  async createRole(
    input: CreateRoleInput,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<RoleDetailItem> {
    // 1. Reserved system slug collision check
    if (isSystemRole(input.slug)) {
      throw AppError.badRequest(`Cannot create role with reserved system identifier: [${input.slug}]`);
    }

    // 2. Uniqueness checks
    const existingSlug = await this.repo.findRoleBySlug(input.slug);
    if (existingSlug) {
      throw AppError.conflict(`A role with slug [${input.slug}] already exists`);
    }

    const existingName = await this.repo.findRoleByName(input.name);
    if (existingName) {
      throw AppError.conflict(`A role with name [${input.name}] already exists`);
    }

    // 3. Privilege Escalation Check: Actor cannot grant permissions they don't possess
    if (input.permissionSlugs && input.permissionSlugs.length > 0 && !this.isActorSuperAdmin(actor)) {
      const actorPerms = await this.cache.getRolePermissions(actor.roles);
      const unauthorizedPerms = input.permissionSlugs.filter(p => !actorPerms.has(p));
      if (unauthorizedPerms.length > 0) {
        throw AppError.forbidden(
          `Privilege escalation denied: You cannot grant permissions you do not possess: [${unauthorizedPerms.join(', ')}]`,
        );
      }
    }

    const role = await this.repo.createRole(input);

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ROLE_CREATED',
      targetType: 'ROLE',
      targetId: role.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: { slug: role.slug, name: role.name },
    });

    return this.formatRoleDetail(role);
  }

  async updateRole(
    id: string,
    input: UpdateRoleInput,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<RoleDetailItem> {
    const role = await this.repo.findRoleById(id);
    if (!role) {
      throw AppError.notFound('Role not found');
    }

    // System roles are immutable in core identity
    if (role.isSystem || isSystemRole(role.slug)) {
      throw AppError.forbidden('Safety violation: System roles cannot be renamed or modified');
    }

    if (input.name && input.name !== role.name) {
      const existingName = await this.repo.findRoleByName(input.name);
      if (existingName && existingName.id !== id) {
        throw AppError.conflict(`A role with name [${input.name}] already exists`);
      }
    }

    const updated = await this.repo.updateRole(id, input);

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ROLE_UPDATED',
      targetType: 'ROLE',
      targetId: id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: {
        before: { name: role.name, description: role.description },
        after: { name: updated.name, description: updated.description },
      },
    });

    return this.formatRoleDetail(updated);
  }

  async deleteRole(
    id: string,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    const role = await this.repo.findRoleById(id);
    if (!role) {
      throw AppError.notFound('Role not found');
    }

    // 1. System roles protection
    if (role.isSystem || isSystemRole(role.slug)) {
      throw AppError.forbidden('Safety violation: System roles cannot be deleted');
    }

    // 2. Active assignments check
    const assignedUserCount = await this.repo.countUsersWithRole(id);
    if (assignedUserCount > 0) {
      throw AppError.badRequest(
        `Cannot delete role [${role.name}] because it is currently assigned to ${assignedUserCount} user(s). Reassign them first.`,
      );
    }

    await this.repo.deleteRole(id);
    this.cache.invalidateCache(role.slug);

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ROLE_DELETED',
      targetType: 'ROLE',
      targetId: id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: { slug: role.slug, name: role.name },
    });
  }

  async assignPermissions(
    id: string,
    input: AssignPermissionsInput,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<RoleDetailItem> {
    const role = await this.repo.findRoleById(id);
    if (!role) {
      throw AppError.notFound('Role not found');
    }

    // Super Administrator inherently possesses all permissions and cannot be constrained
    if (role.slug.toLowerCase() === SYSTEM_ROLE_SLUGS.SUPER_ADMIN) {
      throw AppError.forbidden(
        'Super Administrator role inherently possesses all permissions and cannot be manually modified',
      );
    }

    // Privilege Escalation Check: Actor cannot grant permissions they don't possess
    if (!this.isActorSuperAdmin(actor)) {
      const actorPerms = await this.cache.getRolePermissions(actor.roles);
      const unauthorizedPerms = input.permissionSlugs.filter(p => !actorPerms.has(p));
      if (unauthorizedPerms.length > 0) {
        throw AppError.forbidden(
          `Privilege escalation denied: You cannot grant permissions you do not possess: [${unauthorizedPerms.join(', ')}]`,
        );
      }
    }

    const previousPerms = role.rolePermissions.map(rp => rp.permission.slug);
    const updated = await this.repo.setRolePermissions(id, input.permissionSlugs);

    // Invalidate cached permissions for this role across the server
    this.cache.invalidateCache(role.slug);

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ROLE_PERMISSIONS_UPDATED',
      targetType: 'ROLE',
      targetId: id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: {
        roleSlug: role.slug,
        previousPermissions: previousPerms,
        newPermissions: input.permissionSlugs,
      },
    });

    return this.formatRoleDetail(updated);
  }
}

export const rolesService = new RolesService();
