import { prisma } from '@/config/database';

export interface IPermissionsRepository {
  getPermissionsByRoles(roleSlugs: string[]): Promise<string[]>;
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
}

export const permissionsRepository: IPermissionsRepository = new PrismaPermissionsRepository();
