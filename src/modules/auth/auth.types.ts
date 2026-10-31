import type {
  User,
  Session,
  RefreshToken,
  LoginHistory,
  OtpCode,
  EmailVerificationToken,
  PasswordResetToken,
  RoleType,
  DeviceCategory,
} from '@prisma/client';

export interface UserRoleRelation {
  role: {
    id: string;
    name: string;
    slug: string;
    type: RoleType;
  };
}

export type UserWithRoles = User & {
  roles: UserRoleRelation[];
};

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
  deviceCategory?: DeviceCategory;
  browser?: string;
  os?: string;
  origin?: string;
  requestId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUserSummary {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  roles: string[];
}

export interface AuthResult {
  user: AuthUserSummary;
  tokens: AuthTokens;
  sessionId: string;
}

export interface CreateUserDto {
  email: string;
  phone?: string;
  name: string;
  passwordHash: string;
  roleSlug?: string;
}

export interface CreateSessionDto {
  userId: string;
  tokenHash: string;
  deviceCategory?: DeviceCategory;
  browser?: string;
  os?: string;
  ip?: string;
  userAgent?: string;
  expiresAt: Date;
}

export interface CreateRefreshTokenDto {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export interface CreateLoginHistoryDto {
  userId?: string;
  email: string;
  status: 'SUCCESS' | 'FAILED';
  reason?: string;
  ip?: string;
  userAgent?: string;
  device?: string;
}

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<UserWithRoles | null>;
  findUserByPhone(phone: string): Promise<UserWithRoles | null>;
  findUserById(id: string): Promise<UserWithRoles | null>;
  createUser(data: CreateUserDto): Promise<UserWithRoles>;
  updateUser(id: string, data: Partial<User>): Promise<UserWithRoles>;
  incrementFailedLogin(userId: string, lockUntil?: Date): Promise<void>;
  resetFailedLogin(userId: string): Promise<void>;

  createSession(data: CreateSessionDto): Promise<Session>;
  findSessionById(id: string): Promise<Session | null>;
  findSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  revokeSession(id: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;

  createRefreshToken(data: CreateRefreshTokenDto): Promise<RefreshToken>;
  findRefreshTokenByHash(hash: string): Promise<RefreshToken | null>;
  markRefreshTokenUsed(id: string, replacedByTokenId?: string): Promise<void>;
  revokeRefreshTokenFamily(familyId: string): Promise<void>;

  createLoginHistory(data: CreateLoginHistoryDto): Promise<void>;
  getLoginHistory(userId: string, limit?: number): Promise<LoginHistory[]>;

  createEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findEmailVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null>;
  deleteEmailVerificationToken(id: string): Promise<void>;

  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null>;
  deletePasswordResetToken(id: string): Promise<void>;

  createOtpCode(identifier: string, codeHash: string, purpose: string, expiresAt: Date): Promise<void>;
  findLatestValidOtp(identifier: string, purpose: string): Promise<OtpCode | null>;
  incrementOtpAttempts(id: string): Promise<void>;
  markOtpUsed(id: string): Promise<void>;
}
