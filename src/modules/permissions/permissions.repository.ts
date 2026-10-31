import { prisma } from '@/config/database';
import type { Permission } from '@prisma/client';

export interface IPermissionsRepository {
  getPermissionsByRoles(roleSlugs: string[]): Promise<string[]>;
  getAllPermissions(): Promise<Permission[]>;
}

export class PrismaPermissionsRepository implements IPermissionsRepository {
  async getPermissionsByRoles(roleSlugs: string[]): Promise<string[]> {
    if (roleSlugs.length === 0) return [];

    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        role: {
          slug: { in: roleSlugs },
        },
      },
      include: {
        permission: true,
      },
    });

    return rolePermissions.map(rp => rp.permission.slug);
  }

  async getAllPermissions(): Promise<Permission[]> {
    return prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }
}

export const permissionsRepository: IPermissionsRepository = new PrismaPermissionsRepository();
