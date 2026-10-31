import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RolesService } from '@/modules/roles/roles.service';
import type { IRolesRepository, RoleWithPermissions } from '@/modules/roles/roles.types';
import type { IAuditService } from '@/services/audit.service';
import { PermissionsCache } from '@/modules/permissions/permissions.cache';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import type { IPermissionsRepository } from '@/modules/permissions/permissions.repository';
import type { AccessTokenPayload } from '@/utils/jwt.util';
import type { Permission } from '@prisma/client';

describe('Roles & Permissions Services (Unit Tests)', () => {
  let rolesService: RolesService;
  let mockRolesRepo: vi.Mocked<IRolesRepository>;
  let mockAuditSvc: vi.Mocked<IAuditService>;
  let permissionsCache: PermissionsCache;

  let permissionsService: PermissionsService;
  let mockPermsRepo: vi.Mocked<IPermissionsRepository>;

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

  const createMockRole = (overrides: Partial<RoleWithPermissions> = {}): RoleWithPermissions => ({
    id: 'role_custom_1',
    name: 'Custom Marketing',
    slug: 'custom-marketing',
    type: 'CUSTOMER',
    description: 'Marketing staff',
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    rolePermissions: [
      {
        permission: {
          id: 'perm_1',
          name: 'Read Coupons',
          slug: 'coupon:read',
          resource: 'coupon',
          action: 'read',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    mockRolesRepo = {
      findAllRoles: vi.fn(),
      findRoleById: vi.fn(),
      findRoleBySlug: vi.fn(),
      findRoleByName: vi.fn(),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn().mockResolvedValue(undefined),
      setRolePermissions: vi.fn(),
      countUsersWithRole: vi.fn().mockResolvedValue(0),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    mockPermsRepo = {
      getPermissionsByRoles: vi.fn(),
      getAllPermissions: vi.fn(),
    };

    permissionsCache = new PermissionsCache();
    rolesService = new RolesService(mockRolesRepo, mockAuditSvc, permissionsCache);
    permissionsService = new PermissionsService(mockPermsRepo);
  });

  describe('createRole', () => {
    it('should create a custom role successfully', async () => {
      mockRolesRepo.findRoleBySlug.mockResolvedValue(null);
      mockRolesRepo.findRoleByName.mockResolvedValue(null);
      const created = createMockRole();
      mockRolesRepo.createRole.mockResolvedValue(created);

      const res = await rolesService.createRole(
        {
          name: 'Custom Marketing',
          slug: 'custom-marketing',
          description: 'Marketing team role',
        },
        superAdminActor,
      );

      expect(res.slug).toBe(created.slug);
      expect(mockRolesRepo.createRole).toHaveBeenCalled();
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_CREATED' }),
      );
    });

    it('should reject creation with reserved system slug', async () => {
      await expect(
        rolesService.createRole(
          {
            name: 'New Super Admin',
            slug: 'super-admin', // Reserved system slug!
          },
          superAdminActor,
        ),
      ).rejects.toThrowError(/reserved system identifier/);
    });

    it('should reject creation if slug already exists', async () => {
      mockRolesRepo.findRoleBySlug.mockResolvedValue(createMockRole());

      await expect(
        rolesService.createRole(
          {
            name: 'Another Role',
            slug: 'custom-marketing',
          },
          superAdminActor,
        ),
      ).rejects.toThrowError(/already exists/);
    });

    it('should block privilege escalation when non-super-admin tries to grant permissions they lack', async () => {
      mockRolesRepo.findRoleBySlug.mockResolvedValue(null);
      mockRolesRepo.findRoleByName.mockResolvedValue(null);

      // Manager only has 'product:read'
      vi.spyOn(permissionsCache, 'getRolePermissions').mockResolvedValue(
        new Set(['product:read']),
      );

      await expect(
        rolesService.createRole(
          {
            name: 'Super Assistant',
            slug: 'super-assistant',
            permissionSlugs: ['product:read', 'user:delete'], // lacks user:delete!
          },
          managerActor,
        ),
      ).rejects.toThrowError(/Privilege escalation denied/);
    });
  });

  describe('updateRole & System Role Protection', () => {
    it('should prevent modifying or renaming system roles', async () => {
      const systemRole = createMockRole({
        slug: 'admin',
        isSystem: true,
      });
      mockRolesRepo.findRoleById.mockResolvedValue(systemRole);

      await expect(
        rolesService.updateRole('system_role_id', { name: 'Renamed Store Admin' }, superAdminActor),
      ).rejects.toThrowError(/Safety violation: System roles cannot be renamed or modified/);
    });

    it('should update custom role details', async () => {
      const customRole = createMockRole();
      mockRolesRepo.findRoleById.mockResolvedValue(customRole);
      mockRolesRepo.findRoleByName.mockResolvedValue(null);
      mockRolesRepo.updateRole.mockResolvedValue({
        ...customRole,
        name: 'Updated Marketing Team',
      });

      const res = await rolesService.updateRole(
        'role_custom_1',
        { name: 'Updated Marketing Team' },
        superAdminActor,
      );

      expect(res.name).toBe('Updated Marketing Team');
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_UPDATED' }),
      );
    });
  });

  describe('deleteRole Safety', () => {
    it('should prevent deleting system roles', async () => {
      const systemRole = createMockRole({
        slug: 'manager',
        isSystem: true,
      });
      mockRolesRepo.findRoleById.mockResolvedValue(systemRole);

      await expect(rolesService.deleteRole('sys_role_1', superAdminActor)).rejects.toThrowError(
        /Safety violation: System roles cannot be deleted/,
      );
    });

    it('should prevent deleting a role assigned to active users', async () => {
      const customRole = createMockRole();
      mockRolesRepo.findRoleById.mockResolvedValue(customRole);
      // Assigned to 3 users!
      mockRolesRepo.countUsersWithRole.mockResolvedValue(3);

      await expect(
        rolesService.deleteRole('role_custom_1', superAdminActor),
      ).rejects.toThrowError(/currently assigned to 3 user\(s\)/);
    });

    it('should delete unassigned custom role and invalidate permissions cache', async () => {
      const customRole = createMockRole();
      mockRolesRepo.findRoleById.mockResolvedValue(customRole);
      mockRolesRepo.countUsersWithRole.mockResolvedValue(0);

      const invalidateSpy = vi.spyOn(permissionsCache, 'invalidateCache');

      await rolesService.deleteRole('role_custom_1', superAdminActor);

      expect(mockRolesRepo.deleteRole).toHaveBeenCalledWith('role_custom_1');
      expect(invalidateSpy).toHaveBeenCalledWith(customRole.slug);
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_DELETED' }),
      );
    });
  });

  describe('assignPermissions & Cache Invalidation', () => {
    it('should prevent modifying Super Administrator permissions', async () => {
      const superAdminRole = createMockRole({
        slug: 'super-admin',
        isSystem: true,
      });
      mockRolesRepo.findRoleById.mockResolvedValue(superAdminRole);

      await expect(
        rolesService.assignPermissions(
          'super_admin_role_id',
          { permissionSlugs: ['product:read'] },
          superAdminActor,
        ),
      ).rejects.toThrowError(/Super Administrator role inherently possesses all permissions/);
    });

    it('should enforce escalation rules: non-super-admin cannot grant permissions they lack', async () => {
      const customRole = createMockRole();
      mockRolesRepo.findRoleById.mockResolvedValue(customRole);

      vi.spyOn(permissionsCache, 'getRolePermissions').mockResolvedValue(
        new Set(['order:read', 'order:create']),
      );

      await expect(
        rolesService.assignPermissions(
          'role_custom_1',
          { permissionSlugs: ['order:read', 'financial:refund'] }, // financial:refund is missing
          managerActor,
        ),
      ).rejects.toThrowError(/Privilege escalation denied/);
    });

    it('should assign permissions and invalidate cache for updated role', async () => {
      const customRole = createMockRole();
      mockRolesRepo.findRoleById.mockResolvedValue(customRole);
      mockRolesRepo.setRolePermissions.mockResolvedValue({
        ...customRole,
        rolePermissions: [
          {
            permission: {
              id: 'p1',
              name: 'Read Products',
              slug: 'product:read',
              resource: 'product',
              action: 'read',
              description: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      });

      const invalidateSpy = vi.spyOn(permissionsCache, 'invalidateCache');

      const res = await rolesService.assignPermissions(
        'role_custom_1',
        { permissionSlugs: ['product:read'] },
        superAdminActor,
      );

      expect(res.permissions).toHaveLength(1);
      expect(invalidateSpy).toHaveBeenCalledWith(customRole.slug);
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_PERMISSIONS_UPDATED' }),
      );
    });
  });

  describe('PermissionsService.getGroupedPermissions', () => {
    it('should group permissions by resource category', async () => {
      const samplePerms: Permission[] = [
        {
          id: '1',
          name: 'Read User',
          slug: 'user:read',
          resource: 'user',
          action: 'read',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Create User',
          slug: 'user:create',
          resource: 'user',
          action: 'create',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          name: 'Read Product',
          slug: 'product:read',
          resource: 'product',
          action: 'read',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPermsRepo.getAllPermissions.mockResolvedValue(samplePerms);

      const grouped = await permissionsService.getGroupedPermissions();

      expect(grouped).toHaveProperty('user');
      expect(grouped.user).toHaveLength(2);
      expect(grouped).toHaveProperty('product');
      expect(grouped.product).toHaveLength(1);
    });
  });
});
