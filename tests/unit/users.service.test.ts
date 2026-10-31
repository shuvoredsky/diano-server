import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersService } from '@/modules/users/users.service';
import type { IUsersRepository } from '@/modules/users/users.types';
import type { IAuthRepository, UserWithRoles } from '@/modules/auth/auth.types';
import type { IAuditService } from '@/services/audit.service';
import type { AccessTokenPayload } from '@/utils/jwt.util';

describe('UsersService (Unit Tests)', () => {
  let service: UsersService;
  let mockRepo: vi.Mocked<IUsersRepository>;
  let mockAuthRepo: vi.Mocked<IAuthRepository>;
  let mockAuditSvc: vi.Mocked<IAuditService>;

  const superAdminActor: AccessTokenPayload = {
    userId: 'super_admin_id',
    sessionId: 'session_1',
    roles: ['super-admin'],
    email: 'superadmin@diano.com',
  };

  const managerActor: AccessTokenPayload = {
    userId: 'manager_id',
    sessionId: 'session_2',
    roles: ['manager'],
    email: 'manager@diano.com',
  };

  const createMockUser = (overrides: Partial<UserWithRoles> = {}): UserWithRoles => ({
    id: 'target_user_id',
    email: 'staff@diano.com',
    phone: '+8801711111111',
    name: 'Staff Member',
    passwordHash: 'hashed_password',
    avatarUrl: null,
    status: 'ACTIVE',
    isEmailVerified: true,
    isPhoneVerified: true,
    failedLoginAttempts: 0,
    lockUntil: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [
      {
        role: {
          id: 'role_staff',
          name: 'Support Staff',
          slug: 'support-staff',
          type: 'SUPPORT_STAFF',
        },
      },
    ],
    ...overrides,
  });

  const createMockSuperAdminUser = (overrides: Partial<UserWithRoles> = {}): UserWithRoles => ({
    ...createMockUser({
      id: 'super_admin_id_1',
      email: 'root@diano.com',
      roles: [
        {
          role: {
            id: 'role_super',
            name: 'Super Administrator',
            slug: 'super-admin',
            type: 'SUPER_ADMIN',
          },
        },
      ],
      ...overrides,
    }),
  });

  beforeEach(() => {
    mockRepo = {
      findUsers: vi.fn(),
      findUserById: vi.fn(),
      findUserByEmail: vi.fn(),
      findUserByPhone: vi.fn(),
      countActiveSuperAdmins: vi.fn().mockResolvedValue(2),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      updateUserStatus: vi.fn(),
      assignRole: vi.fn().mockResolvedValue(undefined),
      softDeleteUser: vi.fn().mockResolvedValue(undefined),
    };

    mockAuthRepo = {
      findUserByEmail: vi.fn(),
      findUserByPhone: vi.fn(),
      findUserById: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      incrementFailedLogin: vi.fn(),
      resetFailedLogin: vi.fn(),
      createSession: vi.fn(),
      findSessionById: vi.fn(),
      findSessionByTokenHash: vi.fn(),
      revokeSession: vi.fn(),
      revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
      createRefreshToken: vi.fn(),
      findRefreshTokenByHash: vi.fn(),
      markRefreshTokenUsed: vi.fn(),
      revokeRefreshTokenFamily: vi.fn(),
      createLoginHistory: vi.fn(),
      getLoginHistory: vi.fn(),
      createEmailVerificationToken: vi.fn(),
      findEmailVerificationToken: vi.fn(),
      deleteEmailVerificationToken: vi.fn(),
      createPasswordResetToken: vi.fn(),
      findPasswordResetToken: vi.fn(),
      deletePasswordResetToken: vi.fn(),
      createOtpCode: vi.fn(),
      findLatestValidOtp: vi.fn(),
      incrementOtpAttempts: vi.fn(),
      markOtpUsed: vi.fn(),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new UsersService(mockRepo, mockAuthRepo, mockAuditSvc);
  });

  describe('createAdminUser', () => {
    it('should allow Super Admin to create users of any tier', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);
      mockRepo.findUserByPhone.mockResolvedValue(null);
      const created = createMockUser();
      mockRepo.createUser.mockResolvedValue(created);

      const res = await service.createAdminUser(
        {
          email: 'admin@diano.com',
          name: 'New Admin',
          roleSlug: 'admin',
        },
        superAdminActor,
      );

      expect(res.id).toBe(created.id);
      expect(mockRepo.createUser).toHaveBeenCalled();
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_USER_CREATED' }),
      );
    });

    it('should block privilege escalation: Manager cannot create an Admin or Manager', async () => {
      // Manager is tier 60, Admin is tier 80, Manager is tier 60
      await expect(
        service.createAdminUser(
          {
            email: 'admin@diano.com',
            name: 'New Admin',
            roleSlug: 'admin', // 80 > 60
          },
          managerActor,
        ),
      ).rejects.toThrowError(/Privilege escalation denied/);

      await expect(
        service.createAdminUser(
          {
            email: 'peer@diano.com',
            name: 'Peer Manager',
            roleSlug: 'manager', // 60 == 60
          },
          managerActor,
        ),
      ).rejects.toThrowError(/Privilege escalation denied/);
    });

    it('should allow Manager to create subordinate tiers (e.g. Support Staff)', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);
      mockRepo.findUserByPhone.mockResolvedValue(null);
      mockRepo.createUser.mockResolvedValue(createMockUser());

      // Support staff is tier 20 < Manager tier 60
      const res = await service.createAdminUser(
        {
          email: 'support@diano.com',
          name: 'Support Agent',
          roleSlug: 'support-staff',
        },
        managerActor,
      );

      expect(res).toBeDefined();
    });
  });

  describe('updateUser & Role Transition Safety', () => {
    it('should prevent non-Super-Admin from modifying a Super Admin account', async () => {
      const superAdminUser = createMockSuperAdminUser();
      mockRepo.findUserById.mockResolvedValue(superAdminUser);

      await expect(
        service.updateUser('super_admin_id_1', { name: 'New Name' }, managerActor),
      ).rejects.toThrowError(/Only Super Administrators can modify a Super Administrator account/);
    });

    it('should block privilege escalation when reassigning roles', async () => {
      const targetUser = createMockUser();
      mockRepo.findUserById.mockResolvedValue(targetUser);

      // Manager trying to elevate Support Staff to Admin
      await expect(
        service.updateUser('target_user_id', { roleSlug: 'admin' }, managerActor),
      ).rejects.toThrowError(/Privilege escalation denied/);
    });

    it('should prevent demoting the last remaining active Super Admin', async () => {
      const superAdminUser = createMockSuperAdminUser();
      mockRepo.findUserById.mockResolvedValue(superAdminUser);
      // Only 1 super admin left in the system!
      mockRepo.countActiveSuperAdmins.mockResolvedValue(1);

      await expect(
        service.updateUser('super_admin_id_1', { roleSlug: 'admin' }, superAdminActor),
      ).rejects.toThrowError(/Cannot remove or demote the last remaining active Super Administrator/);
    });

    it('should revoke all active sessions when a role change occurs', async () => {
      const targetUser = createMockUser();
      mockRepo.findUserById.mockResolvedValue(targetUser);

      await service.updateUser('target_user_id', { roleSlug: 'manager' }, superAdminActor);

      expect(mockRepo.assignRole).toHaveBeenCalledWith('target_user_id', 'manager');
      // Critical security requirement: revoke sessions immediately
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith('target_user_id');
    });
  });

  describe('updateUserStatus Safety', () => {
    it('should prevent self-suspension', async () => {
      await expect(
        service.updateUserStatus('super_admin_id', { status: 'SUSPENDED' }, superAdminActor),
      ).rejects.toThrowError(/You cannot suspend or deactivate your own account/);
    });

    it('should prevent suspending the last remaining Super Admin', async () => {
      const superAdminUser = createMockSuperAdminUser({ id: 'target_super_id' });
      mockRepo.findUserById.mockResolvedValue(superAdminUser);
      mockRepo.countActiveSuperAdmins.mockResolvedValue(1);

      await expect(
        service.updateUserStatus('target_super_id', { status: 'SUSPENDED' }, superAdminActor),
      ).rejects.toThrowError(/Cannot suspend the last active Super Administrator/);
    });

    it('should revoke all active sessions when account is suspended', async () => {
      const targetUser = createMockUser({ id: 'staff_1' });
      mockRepo.findUserById.mockResolvedValue(targetUser);
      mockRepo.updateUserStatus.mockResolvedValue({ ...targetUser, status: 'SUSPENDED' });

      await service.updateUserStatus('staff_1', { status: 'SUSPENDED' }, superAdminActor);

      expect(mockRepo.updateUserStatus).toHaveBeenCalledWith('staff_1', 'SUSPENDED');
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith('staff_1');
    });
  });

  describe('deleteUser (Soft Delete) Safety', () => {
    it('should prevent self-deletion', async () => {
      await expect(service.deleteUser('super_admin_id', superAdminActor)).rejects.toThrowError(
        /You cannot delete your own account/,
      );
    });

    it('should prevent deleting the last Super Admin', async () => {
      const superAdminUser = createMockSuperAdminUser({ id: 'target_super_2' });
      mockRepo.findUserById.mockResolvedValue(superAdminUser);
      mockRepo.countActiveSuperAdmins.mockResolvedValue(1);

      await expect(service.deleteUser('target_super_2', superAdminActor)).rejects.toThrowError(
        /Cannot delete the last active Super Administrator/,
      );
    });

    it('should soft-delete user and revoke sessions', async () => {
      const targetUser = createMockUser({ id: 'staff_to_delete' });
      mockRepo.findUserById.mockResolvedValue(targetUser);

      await service.deleteUser('staff_to_delete', superAdminActor);

      expect(mockRepo.softDeleteUser).toHaveBeenCalledWith('staff_to_delete');
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith('staff_to_delete');
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_USER_DELETED' }),
      );
    });
  });
});
