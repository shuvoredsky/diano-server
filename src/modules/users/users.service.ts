import { AppError } from '@/utils/app-error';
import { hashPassword } from '@/utils/password.util';
import { generateRandomToken } from '@/utils/token.util';
import { getPagination, getPaginationMeta } from '@/utils/pagination';
import { SYSTEM_ROLE_SLUGS, getRoleHierarchyLevel } from '@/constants/roles';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import type {
  IUsersRepository,
  UserQueryOptions,
  CreateAdminUserInput,
  UpdateUserInput,
  UpdateUserStatusInput,
  PaginatedUsersResult,
  UserSummaryItem,
} from './users.types';
import { usersRepository as defaultUsersRepo } from './users.repository';
import type { IAuthRepository } from '@/modules/auth/auth.types';
import { authRepository as defaultAuthRepo } from '@/modules/auth/auth.repository';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';
import type { UserWithRoles } from '@/modules/auth/auth.types';

export class UsersService {
  constructor(
    private readonly repo: IUsersRepository = defaultUsersRepo,
    private readonly authRepo: IAuthRepository = defaultAuthRepo,
    private readonly auditSvc: IAuditService = defaultAuditService,
  ) {}

  private getActorHighestLevel(actor: AccessTokenPayload): number {
    const isSuperAdmin = actor.roles.some(
      r => r.toLowerCase() === SYSTEM_ROLE_SLUGS.SUPER_ADMIN || r === 'SUPER_ADMIN',
    );
    if (isSuperAdmin) return 100;

    const levels = actor.roles.map(r => getRoleHierarchyLevel(r));
    return Math.max(...levels, 0);
  }

  private isActorSuperAdmin(actor: AccessTokenPayload): boolean {
    return actor.roles.some(
      r => r.toLowerCase() === SYSTEM_ROLE_SLUGS.SUPER_ADMIN || r === 'SUPER_ADMIN',
    );
  }

  private isTargetSuperAdmin(target: UserWithRoles): boolean {
    return target.roles.some(
      r => r.role.slug.toLowerCase() === SYSTEM_ROLE_SLUGS.SUPER_ADMIN || r.role.type === 'SUPER_ADMIN',
    );
  }

  private formatUserSummary(user: UserWithRoles): UserSummaryItem {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      roles: user.roles.map(r => ({
        id: r.role.id,
        name: r.role.name,
        slug: r.role.slug,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async listUsers(filter: UserQueryOptions): Promise<PaginatedUsersResult> {
    const { page, limit, skip, take } = getPagination(filter);
    const { items, total } = await this.repo.findUsers({ ...filter, page, limit, skip, take });

    return {
      items: items.map(u => this.formatUserSummary(u)),
      meta: getPaginationMeta(total, page, limit),
    };
  }

  async getUserById(id: string): Promise<UserSummaryItem> {
    const user = await this.repo.findUserById(id);
    if (!user) {
      throw AppError.notFound('User not found');
    }
    return this.formatUserSummary(user);
  }

  async createAdminUser(
    input: CreateAdminUserInput,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<UserSummaryItem> {
    // 1. Privilege Escalation Check: Cannot assign role equal or higher than actor level
    const targetRoleLevel = getRoleHierarchyLevel(input.roleSlug);
    const actorHighestLevel = this.getActorHighestLevel(actor);

    if (!this.isActorSuperAdmin(actor) && actorHighestLevel <= targetRoleLevel) {
      throw AppError.forbidden(
        'Privilege escalation denied: You cannot create a user with a role equal to or higher than your own tier',
      );
    }

    // 2. Uniqueness checks
    const existingEmail = await this.repo.findUserByEmail(input.email);
    if (existingEmail) {
      throw AppError.conflict('An account with this email address already exists');
    }

    if (input.phone) {
      const existingPhone = await this.repo.findUserByPhone(input.phone);
      if (existingPhone) {
        throw AppError.conflict('An account with this phone number already exists');
      }
    }

    // 3. Password handling (plaintext never logged or returned)
    const rawPassword = input.password ?? `${generateRandomToken(10)}Aa1!`;
    const passwordHash = await hashPassword(rawPassword);

    const user = await this.repo.createUser({
      email: input.email,
      name: input.name,
      phone: input.phone,
      passwordHash,
      roleSlug: input.roleSlug,
    });

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ADMIN_USER_CREATED',
      targetType: 'USER',
      targetId: user.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: { email: user.email, role: input.roleSlug },
    });

    return this.formatUserSummary(user);
  }

  async updateUser(
    id: string,
    input: UpdateUserInput,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<UserSummaryItem> {
    const target = await this.repo.findUserById(id);
    if (!target) {
      throw AppError.notFound('User not found');
    }

    const targetIsSuperAdmin = this.isTargetSuperAdmin(target);
    const actorIsSuperAdmin = this.isActorSuperAdmin(actor);

    // 1. Modifying a Super Administrator account requires Super Administrator actor
    if (targetIsSuperAdmin && !actorIsSuperAdmin) {
      throw AppError.forbidden('Only Super Administrators can modify a Super Administrator account');
    }

    // 2. Role change and escalation checks
    if (input.roleSlug) {
      const targetRoleLevel = getRoleHierarchyLevel(input.roleSlug);
      const actorHighestLevel = this.getActorHighestLevel(actor);

      // Cannot assign role equal or higher than actor level (unless super-admin)
      if (!actorIsSuperAdmin && actorHighestLevel <= targetRoleLevel) {
        throw AppError.forbidden(
          'Privilege escalation denied: You cannot assign a role equal to or higher than your own tier',
        );
      }

      // Last Super Admin protection: Cannot demote the last super admin
      if (targetIsSuperAdmin && input.roleSlug.toLowerCase() !== SYSTEM_ROLE_SLUGS.SUPER_ADMIN) {
        const superAdminCount = await this.repo.countActiveSuperAdmins();
        if (superAdminCount <= 1) {
          throw AppError.forbidden(
            'Action rejected: Cannot remove or demote the last remaining active Super Administrator',
          );
        }
      }

      await this.repo.assignRole(id, input.roleSlug);
      // Security: revoke all active sessions on role transition
      await this.authRepo.revokeAllUserSessions(id);
    }

    let updated = target;
    if (input.name !== undefined || input.phone !== undefined) {
      updated = await this.repo.updateUser(id, {
        name: input.name,
        phone: input.phone,
      });
    }

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ADMIN_USER_UPDATED',
      targetType: 'USER',
      targetId: id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: { modifiedFields: Object.keys(input) },
    });

    const refreshed = await this.repo.findUserById(id);
    return this.formatUserSummary(refreshed ?? updated);
  }

  async updateUserStatus(
    id: string,
    input: UpdateUserStatusInput,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<UserSummaryItem> {
    // 1. Self-suspension protection
    if (actor.userId === id) {
      throw AppError.badRequest('Safety policy violation: You cannot suspend or deactivate your own account');
    }

    const target = await this.repo.findUserById(id);
    if (!target) {
      throw AppError.notFound('User not found');
    }

    const targetIsSuperAdmin = this.isTargetSuperAdmin(target);
    const actorIsSuperAdmin = this.isActorSuperAdmin(actor);

    // 2. Modifying a Super Administrator account requires Super Administrator actor
    if (targetIsSuperAdmin && !actorIsSuperAdmin) {
      throw AppError.forbidden('Only Super Administrators can modify a Super Administrator account');
    }

    // 3. Last Super Admin protection: Cannot suspend the last active super-admin
    if (targetIsSuperAdmin && input.status === 'SUSPENDED') {
      const activeSuperAdmins = await this.repo.countActiveSuperAdmins();
      if (activeSuperAdmins <= 1) {
        throw AppError.forbidden(
          'Safety policy violation: Cannot suspend the last active Super Administrator',
        );
      }
    }

    const updated = await this.repo.updateUserStatus(id, input.status);

    // Security: if user is suspended, immediately terminate all active sessions
    if (input.status === 'SUSPENDED') {
      await this.authRepo.revokeAllUserSessions(id);
    }

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ADMIN_USER_STATUS_CHANGED',
      targetType: 'USER',
      targetId: id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: { previousStatus: target.status, newStatus: input.status },
    });

    return this.formatUserSummary(updated);
  }

  async deleteUser(
    id: string,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    // 1. Self-deletion protection
    if (actor.userId === id) {
      throw AppError.badRequest('Safety policy violation: You cannot delete your own account');
    }

    const target = await this.repo.findUserById(id);
    if (!target) {
      throw AppError.notFound('User not found');
    }

    const targetIsSuperAdmin = this.isTargetSuperAdmin(target);
    const actorIsSuperAdmin = this.isActorSuperAdmin(actor);

    // 2. Modifying/Deleting a Super Administrator account requires Super Administrator actor
    if (targetIsSuperAdmin && !actorIsSuperAdmin) {
      throw AppError.forbidden('Only Super Administrators can delete a Super Administrator account');
    }

    // 3. Last Super Admin protection: Cannot delete the last active super-admin
    if (targetIsSuperAdmin) {
      const activeSuperAdmins = await this.repo.countActiveSuperAdmins();
      if (activeSuperAdmins <= 1) {
        throw AppError.forbidden(
          'Safety policy violation: Cannot delete the last active Super Administrator',
        );
      }
    }

    // Soft delete
    await this.repo.softDeleteUser(id);
    // Invalidate all sessions immediately
    await this.authRepo.revokeAllUserSessions(id);

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ADMIN_USER_DELETED',
      targetType: 'USER',
      targetId: id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
    });
  }

  async revokeUserSessions(
    id: string,
    actor: AccessTokenPayload,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    const target = await this.repo.findUserById(id);
    if (!target) {
      throw AppError.notFound('User not found');
    }

    if (this.isTargetSuperAdmin(target) && !this.isActorSuperAdmin(actor)) {
      throw AppError.forbidden(
        'Only Super Administrators can terminate sessions of another Super Administrator',
      );
    }

    await this.authRepo.revokeAllUserSessions(id);

    await this.auditSvc.record({
      actorId: actor.userId,
      actorType: 'USER',
      action: 'ADMIN_USER_SESSIONS_REVOKED',
      targetType: 'USER',
      targetId: id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
    });
  }
}

export const usersService: UsersService = new UsersService();
