import { prisma } from '@/config/database';
import type { UserStatus, Prisma } from '@prisma/client';
import type { UserWithRoles } from '@/modules/auth/auth.types';
import type { IUsersRepository, UserFilterOptions } from './users.types';
import { SYSTEM_ROLE_SLUGS } from '@/constants/roles';

export class PrismaUsersRepository implements IUsersRepository {
  async findUsers(filter: UserFilterOptions): Promise<{ items: UserWithRoles[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.role
        ? {
            roles: {
              some: {
                role: {
                  slug: filter.role.toLowerCase(),
                },
              },
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } },
              { phone: { contains: filter.search } },
            ],
          }
        : {}),
    };

    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'desc';

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: filter.skip,
        take: filter.take,
        orderBy: { [sortBy]: sortOrder },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { items: items as UserWithRoles[], total };
  }

  async findUserById(id: string): Promise<UserWithRoles | null> {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }) as Promise<UserWithRoles | null>;
  }

  async findUserByEmail(email: string): Promise<UserWithRoles | null> {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }) as Promise<UserWithRoles | null>;
  }

  async findUserByPhone(phone: string): Promise<UserWithRoles | null> {
    return prisma.user.findFirst({
      where: { phone, deletedAt: null },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }) as Promise<UserWithRoles | null>;
  }

  async countActiveSuperAdmins(): Promise<number> {
    return prisma.user.count({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              slug: SYSTEM_ROLE_SLUGS.SUPER_ADMIN,
            },
          },
        },
      },
    });
  }

  async createUser(data: {
    email: string;
    name: string;
    phone?: string;
    passwordHash: string;
    roleSlug: string;
  }): Promise<UserWithRoles> {
    return prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        phone: data.phone,
        passwordHash: data.passwordHash,
        roles: {
          create: {
            role: {
              connect: { slug: data.roleSlug.toLowerCase() },
            },
          },
        },
        profile: {
          create: {},
        },
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }) as Promise<UserWithRoles>;
  }

  async updateUser(
    id: string,
    data: { name?: string; phone?: string; avatarUrl?: string },
  ): Promise<UserWithRoles> {
    return prisma.user.update({
      where: { id },
      data,
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }) as Promise<UserWithRoles>;
  }

  async updateUserStatus(id: string, status: UserStatus): Promise<UserWithRoles> {
    return prisma.user.update({
      where: { id },
      data: { status },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }) as Promise<UserWithRoles>;
  }

  async assignRole(userId: string, roleSlug: string): Promise<void> {
    const role = await prisma.role.findUnique({
      where: { slug: roleSlug.toLowerCase() },
    });

    if (!role) {
      throw new Error(`Role not found with slug: ${roleSlug}`);
    }

    // Atomic replacement: remove old roles and assign new role
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.create({
        data: {
          userId,
          roleId: role.id,
        },
      }),
    ]);
  }

  async softDeleteUser(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
      },
    });
  }
}

export const usersRepository: IUsersRepository = new PrismaUsersRepository();
