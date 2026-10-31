import { prisma } from '@/config/database';
import type { IRolesRepository, RoleWithPermissions } from './roles.types';

export class PrismaRolesRepository implements IRolesRepository {
  async findAllRoles(): Promise<RoleWithPermissions[]> {
    return prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    }) as Promise<RoleWithPermissions[]>;
  }

  async findRoleById(id: string): Promise<RoleWithPermissions | null> {
    return prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    }) as Promise<RoleWithPermissions | null>;
  }

  async findRoleBySlug(slug: string): Promise<RoleWithPermissions | null> {
    return prisma.role.findUnique({
      where: { slug: slug.toLowerCase() },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    }) as Promise<RoleWithPermissions | null>;
  }

  async findRoleByName(name: string): Promise<RoleWithPermissions | null> {
    return prisma.role.findUnique({
      where: { name },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    }) as Promise<RoleWithPermissions | null>;
  }

  async createRole(data: {
    name: string;
    slug: string;
    description?: string;
    permissionSlugs?: string[];
  }): Promise<RoleWithPermissions> {
    const permissions = data.permissionSlugs && data.permissionSlugs.length > 0
      ? await prisma.permission.findMany({
          where: { slug: { in: data.permissionSlugs } },
        })
      : [];

    return prisma.role.create({
      data: {
        name: data.name,
        slug: data.slug.toLowerCase(),
        description: data.description,
        isSystem: false,
        rolePermissions: {
          create: permissions.map(p => ({
            permission: { connect: { id: p.id } },
          })),
        },
      },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    }) as Promise<RoleWithPermissions>;
  }

  async updateRole(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<RoleWithPermissions> {
    return prisma.role.update({
      where: { id },
      data,
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    }) as Promise<RoleWithPermissions>;
  }

  async deleteRole(id: string): Promise<void> {
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      prisma.role.delete({ where: { id } }),
    ]);
  }

  async setRolePermissions(roleId: string, permissionSlugs: string[]): Promise<RoleWithPermissions> {
    const permissions = await prisma.permission.findMany({
      where: { slug: { in: permissionSlugs } },
    });

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({
        data: permissions.map(p => ({
          roleId,
          permissionId: p.id,
        })),
      }),
    ]);

    return this.findRoleById(roleId) as Promise<RoleWithPermissions>;
  }

  async countUsersWithRole(roleId: string): Promise<number> {
    return prisma.userRole.count({
      where: { roleId },
    });
  }
}

export const rolesRepository: IRolesRepository = new PrismaRolesRepository();
