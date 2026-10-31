import { prisma } from '@/config/database';
import type {
  IAuthRepository,
  UserWithRoles,
  CreateUserDto,
  CreateSessionDto,
  CreateRefreshTokenDto,
  CreateLoginHistoryDto,
} from './auth.types';
import type {
  User,
  Session,
  RefreshToken,
  LoginHistory,
  EmailVerificationToken,
  PasswordResetToken,
  OtpCode,
} from '@prisma/client';

export class PrismaAuthRepository implements IAuthRepository {
  async findUserByEmail(email: string): Promise<UserWithRoles | null> {
    return prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        deletedAt: null,
      },
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
      where: {
        phone,
        deletedAt: null,
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }) as Promise<UserWithRoles | null>;
  }

  async findUserById(id: string): Promise<UserWithRoles | null> {
    return prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }) as Promise<UserWithRoles | null>;
  }

  async createUser(data: CreateUserDto): Promise<UserWithRoles> {
    const roleSlug = data.roleSlug ?? 'customer';

    return prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        phone: data.phone,
        name: data.name,
        passwordHash: data.passwordHash,
        roles: {
          create: {
            role: {
              connect: { slug: roleSlug },
            },
          },
        },
        profile: {
          create: {},
        },
        cart: {
          create: {},
        },
        wishlist: {
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

  async updateUser(id: string, data: Partial<User>): Promise<UserWithRoles> {
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

  async incrementFailedLogin(userId: string, lockUntil?: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: { increment: 1 },
        ...(lockUntil && { lockUntil }),
      },
    });
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
      },
    });
  }

  async createSession(data: CreateSessionDto): Promise<Session> {
    return prisma.session.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        deviceCategory: data.deviceCategory,
        browser: data.browser,
        os: data.os,
        ip: data.ip,
        userAgent: data.userAgent,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findSessionById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { id },
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { tokenHash },
    });
  }

  async revokeSession(id: string): Promise<void> {
    await prisma.session.update({
      where: { id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.session.updateMany({
        where: { userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      }),
    ]);
  }

  async createRefreshToken(data: CreateRefreshTokenDto): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        familyId: data.familyId,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findRefreshTokenByHash(hash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
    });
  }

  async markRefreshTokenUsed(id: string, replacedByTokenId?: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id },
      data: {
        usedAt: new Date(),
        replacedByTokenId,
      },
    });
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  }

  async createLoginHistory(data: CreateLoginHistoryDto): Promise<void> {
    await prisma.loginHistory.create({
      data: {
        userId: data.userId,
        email: data.email,
        status: data.status,
        reason: data.reason,
        ip: data.ip,
        userAgent: data.userAgent,
        device: data.device,
      },
    });
  }

  async getLoginHistory(userId: string, limit = 10): Promise<LoginHistory[]> {
    return prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findEmailVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null> {
    return prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
  }

  async deleteEmailVerificationToken(id: string): Promise<void> {
    await prisma.emailVerificationToken.delete({
      where: { id },
    });
  }

  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    return prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
  }

  async deletePasswordResetToken(id: string): Promise<void> {
    await prisma.passwordResetToken.delete({
      where: { id },
    });
  }

  async createOtpCode(
    identifier: string,
    codeHash: string,
    purpose: string,
    expiresAt: Date,
  ): Promise<void> {
    await prisma.otpCode.create({
      data: {
        identifier,
        codeHash,
        purpose,
        expiresAt,
      },
    });
  }

  async findLatestValidOtp(identifier: string, purpose: string): Promise<OtpCode | null> {
    return prisma.otpCode.findFirst({
      where: {
        identifier,
        purpose,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incrementOtpAttempts(id: string): Promise<void> {
    await prisma.otpCode.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
      },
    });
  }

  async markOtpUsed(id: string): Promise<void> {
    await prisma.otpCode.update({
      where: { id },
      data: { isUsed: true },
    });
  }
}

export const authRepository: IAuthRepository = new PrismaAuthRepository();
