import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import { hashPassword, comparePassword, needsRehash } from '@/utils/password.util';
import { generateRandomToken, hashToken, generateNumericOtp } from '@/utils/token.util';
import { generateAccessToken, generateRefreshToken } from '@/utils/jwt.util';
import type {
  IAuthRepository,
  RequestMetadata,
  AuthResult,
  AuthUserSummary,
  UserWithRoles,
} from './auth.types';
import { authRepository as defaultAuthRepo } from './auth.repository';
import type { IEmailService } from '@/services/email.service';
import { emailService as defaultEmailService } from '@/services/email.service';
import type { IAuditService } from '@/services/audit.service';
import { auditService as defaultAuditService } from '@/services/audit.service';
import type {
  RegisterInput,
  LoginInput,
  AdminLoginInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateProfileInput,
} from './auth.validation';
import { ADMIN_ROLE_SLUGS } from '@/constants/roles';
import { permissionsCache, type PermissionsCache } from '@/modules/permissions/permissions.cache';

export class AuthService {
  constructor(
    private readonly repo: IAuthRepository = defaultAuthRepo,
    private readonly emailSvc: IEmailService = defaultEmailService,
    private readonly auditSvc: IAuditService = defaultAuditService,
    private readonly permCache: Pick<PermissionsCache, 'getEffectivePermissions'> = permissionsCache,
  ) {}

  private extractRoleSlugs(user: UserWithRoles): string[] {
    return user.roles.map(r => r.role.slug);
  }

  private async formatUserSummary(user: UserWithRoles): Promise<AuthUserSummary> {
    const roles = this.extractRoleSlugs(user);
    const isSuperAdmin = roles.some(
      r => r.toLowerCase() === 'super-admin' || r.toLowerCase() === 'super_admin',
    );
    const permissions = await this.permCache.getEffectivePermissions(roles);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      roles,
      permissions,
      isSuperAdmin,
    };
  }

  /**
   * Register customer account
   */
  async register(input: RegisterInput, meta: RequestMetadata): Promise<AuthResult> {
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

    const passwordHash = await hashPassword(input.password);
    const user = await this.repo.createUser({
      email: input.email,
      phone: input.phone,
      name: input.name,
      passwordHash,
      roleSlug: 'customer',
    });

    // Generate email verification token
    const verificationToken = generateRandomToken(32);
    const verificationTokenHash = hashToken(verificationToken);
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.repo.createEmailVerificationToken(
      user.id,
      verificationTokenHash,
      verificationExpiresAt,
    );
    await this.emailSvc.sendVerificationEmail(user.email, verificationToken);

    // Issue initial session and tokens
    return this.createAuthSession(user, meta);
  }

  /**
   * Universal Login (Customers and Staff)
   */
  async login(
    input: LoginInput | AdminLoginInput,
    meta: RequestMetadata,
    requireAdminRole = false,
  ): Promise<AuthResult> {
    const genericAuthError = AppError.unauthorized('Invalid email or password');
    const user = await this.repo.findUserByEmail(input.email);

    if (!user) {
      await this.repo.createLoginHistory({
        email: input.email,
        status: 'FAILED',
        reason: 'User not found',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw genericAuthError;
    }

    // Check account lockout status
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      throw AppError.forbidden(
        `Account is temporarily locked due to excessive failed attempts. Try again in ${remainingMinutes} minute(s).`,
      );
    }

    // Check status
    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw AppError.forbidden('Your account has been deactivated or suspended');
    }

    // Verify Password
    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      const newFailedAttempts = user.failedLoginAttempts + 1;
      let lockUntil: Date | undefined;

      if (newFailedAttempts >= env.MAX_LOGIN_ATTEMPTS) {
        lockUntil = new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000);
        await this.auditSvc.record({
          actorId: user.id,
          actorType: 'SYSTEM',
          action: 'ACCOUNT_LOCKED',
          targetType: 'USER',
          targetId: user.id,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { failedAttempts: newFailedAttempts, lockoutMinutes: env.LOCKOUT_DURATION_MINUTES },
        });
      }

      await this.repo.incrementFailedLogin(user.id, lockUntil);
      await this.repo.createLoginHistory({
        userId: user.id,
        email: user.email,
        status: 'FAILED',
        reason: 'Invalid credentials',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      throw genericAuthError;
    }

    // Strict Portal Separation:
    // Administrative accounts must use /auth/admin/login; Customer accounts must use /auth/login
    const roles = this.extractRoleSlugs(user);
    const hasAdminRole = roles.some(role => ADMIN_ROLE_SLUGS.includes(role.toLowerCase()));

    if (requireAdminRole) {
      if (!hasAdminRole) {
        await this.repo.createLoginHistory({
          userId: user.id,
          email: user.email,
          status: 'FAILED',
          reason: 'Non-admin attempted admin login',
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw AppError.forbidden('Access denied. Administrator privileges required.');
      }

      await this.auditSvc.record({
        actorId: user.id,
        actorType: 'USER',
        action: 'ADMIN_LOGIN',
        targetType: 'AUTH',
        targetId: user.id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    } else {
      if (hasAdminRole) {
        await this.repo.createLoginHistory({
          userId: user.id,
          email: user.email,
          status: 'FAILED',
          reason: 'Admin attempted login on customer endpoint',
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw AppError.forbidden(
          'Administrative accounts must authenticate via the administrative portal at /api/v1/auth/admin/login',
        );
      }
    }

    // Reset failed login counter on success
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      await this.repo.resetFailedLogin(user.id);
    }

    // Rehash password if cost parameter has changed
    if (needsRehash(user.passwordHash)) {
      const newHash = await hashPassword(input.password);
      await this.repo.updateUser(user.id, { passwordHash: newHash });
    }

    // Record login success history
    await this.repo.createLoginHistory({
      userId: user.id,
      email: user.email,
      status: 'SUCCESS',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.createAuthSession(user, meta);
  }

  /**
   * Refresh Token Rotation with Automatic Reuse Detection
   */
  async refresh(providedRefreshToken: string, meta: RequestMetadata): Promise<AuthResult> {
    const tokenHash = hashToken(providedRefreshToken);
    const tokenRecord = await this.repo.findRefreshTokenByHash(tokenHash);

    if (!tokenRecord || tokenRecord.isRevoked) {
      throw AppError.unauthorized('Invalid or revoked refresh token');
    }

    // REUSE DETECTION: If this token was already marked as used, compromise detected!
    if (tokenRecord.usedAt !== null) {
      // Immediately revoke all tokens in this family to protect the user
      await this.repo.revokeRefreshTokenFamily(tokenRecord.familyId);
      await this.auditSvc.record({
        actorId: tokenRecord.userId,
        actorType: 'SYSTEM',
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        targetType: 'AUTH',
        targetId: tokenRecord.id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { familyId: tokenRecord.familyId },
      });

      throw AppError.unauthorized(
        'Security alert: Refresh token reuse detected. All sessions in this chain have been terminated. Please log in again.',
      );
    }

    // Check expiration
    if (tokenRecord.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token has expired. Please log in again.');
    }

    const user = await this.repo.findUserById(tokenRecord.userId);
    if (!user || user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw AppError.forbidden('User account is invalid or suspended');
    }

    // ROTATION: Generate new pair, mark old as used and link replacement
    const { token: newRefreshTokenString, hash: newRefreshTokenHash } = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const newRefreshToken = await this.repo.createRefreshToken({
      userId: user.id,
      tokenHash: newRefreshTokenHash,
      familyId: tokenRecord.familyId, // Maintain family lineage
      expiresAt: refreshExpiresAt,
    });

    // Mark previous token as used and record replacement
    await this.repo.markRefreshTokenUsed(tokenRecord.id, newRefreshToken.id);

    // Create / retrieve session
    const sessionToken = generateRandomToken(32);
    const sessionTokenHash = hashToken(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session = await this.repo.createSession({
      userId: user.id,
      tokenHash: sessionTokenHash,
      deviceCategory: meta.deviceCategory,
      browser: meta.browser,
      os: meta.os,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: sessionExpiresAt,
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      sessionId: session.id,
      roles: this.extractRoleSlugs(user),
      email: user.email,
    });

    return {
      user: await this.formatUserSummary(user),
      tokens: {
        accessToken,
        refreshToken: newRefreshTokenString,
      },
      sessionId: session.id,
    };
  }

  /**
   * Logout current session and revoke refresh token
   */
  async logout(refreshTokenString?: string, sessionId?: string): Promise<void> {
    if (refreshTokenString) {
      const hash = hashToken(refreshTokenString);
      const token = await this.repo.findRefreshTokenByHash(hash);
      if (token) {
        await this.repo.revokeRefreshTokenFamily(token.familyId);
      }
    }

    if (sessionId) {
      await this.repo.revokeSession(sessionId);
    }
  }

  /**
   * Terminate all active sessions for a user
   */
  async logoutAll(userId: string): Promise<void> {
    await this.repo.revokeAllUserSessions(userId);
    await this.auditSvc.record({
      actorId: userId,
      actorType: 'USER',
      action: 'LOGOUT_ALL_SESSIONS',
      targetType: 'USER',
      targetId: userId,
    });
  }

  /**
   * Forgot Password - Generic response prevents email enumeration
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericMsg = 'If an account exists with this email, a password reset link has been dispatched.';
    const user = await this.repo.findUserByEmail(email);

    if (!user) {
      return { message: genericMsg };
    }

    const resetToken = generateRandomToken(32);
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.repo.createPasswordResetToken(user.id, tokenHash, expiresAt);
    await this.emailSvc.sendPasswordResetEmail(user.email, resetToken);

    return { message: genericMsg };
  }

  /**
   * Reset Password with single-use token and session revocation
   */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = hashToken(input.token);
    const tokenRecord = await this.repo.findPasswordResetToken(tokenHash);

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw AppError.badRequest('Password reset token is invalid or has expired');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await this.repo.updateUser(tokenRecord.userId, { passwordHash });

    // Invalidate token immediately (single use)
    await this.repo.deletePasswordResetToken(tokenRecord.id);

    // Invalidate all existing sessions and refresh tokens on password change
    await this.repo.revokeAllUserSessions(tokenRecord.userId);

    await this.auditSvc.record({
      actorId: tokenRecord.userId,
      actorType: 'USER',
      action: 'PASSWORD_RESET',
      targetType: 'USER',
      targetId: tokenRecord.userId,
    });
  }

  /**
   * Verify Email
   */
  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    const tokenRecord = await this.repo.findEmailVerificationToken(tokenHash);

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw AppError.badRequest('Email verification token is invalid or has expired');
    }

    await this.repo.updateUser(tokenRecord.userId, { isEmailVerified: true });
    await this.repo.deleteEmailVerificationToken(tokenRecord.id);
  }

  /**
   * Send OTP Code
   */
  async sendOtp(identifier: string, purpose: string): Promise<{ message: string }> {
    const otp = generateNumericOtp(6);
    const codeHash = hashToken(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.repo.createOtpCode(identifier, codeHash, purpose, expiresAt);
    await this.emailSvc.sendOtpEmail(identifier, otp, purpose);

    return { message: 'OTP has been dispatched' };
  }

  /**
   * Verify OTP Code
   */
  async verifyOtp(identifier: string, code: string, purpose: string): Promise<void> {
    const otpRecord = await this.repo.findLatestValidOtp(identifier, purpose);
    if (!otpRecord) {
      throw AppError.badRequest('OTP code is invalid or has expired');
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      throw AppError.forbidden('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    const inputHash = hashToken(code);
    if (inputHash !== otpRecord.codeHash) {
      await this.repo.incrementOtpAttempts(otpRecord.id);
      throw AppError.badRequest('Invalid OTP code');
    }

    await this.repo.markOtpUsed(otpRecord.id);
  }

  /**
   * Change Password (Authenticated)
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    const isValid = await comparePassword(input.currentPassword, user.passwordHash);
    if (!isValid) {
      throw AppError.badRequest('Current password is incorrect');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await this.repo.updateUser(userId, { passwordHash });

    // Revoke all user sessions except possibly current
    await this.repo.revokeAllUserSessions(userId);

    await this.auditSvc.record({
      actorId: userId,
      actorType: 'USER',
      action: 'PASSWORD_CHANGED',
      targetType: 'USER',
      targetId: userId,
    });
  }

  /**
   * Profile Information
   */
  async getProfile(userId: string): Promise<AuthUserSummary> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }
    return this.formatUserSummary(user);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthUserSummary> {
    const user = await this.repo.updateUser(userId, input);
    return this.formatUserSummary(user);
  }

  async getLoginHistory(userId: string) {
    return this.repo.getLoginHistory(userId, 10);
  }

  /**
   * Internal session builder
   */
  private async createAuthSession(user: UserWithRoles, meta: RequestMetadata): Promise<AuthResult> {
    const sessionToken = generateRandomToken(32);
    const sessionTokenHash = hashToken(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await this.repo.createSession({
      userId: user.id,
      tokenHash: sessionTokenHash,
      deviceCategory: meta.deviceCategory,
      browser: meta.browser,
      os: meta.os,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: sessionExpiresAt,
    });

    const { token: refreshTokenString, hash: refreshTokenHash } = generateRefreshToken();
    const familyId = generateRandomToken(16);
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.repo.createRefreshToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      familyId: familyId,
      expiresAt: refreshExpiresAt,
    });

    const roles = this.extractRoleSlugs(user);
    const accessToken = generateAccessToken({
      userId: user.id,
      sessionId: session.id,
      roles,
      email: user.email,
    });

    return {
      user: await this.formatUserSummary(user),
      tokens: {
        accessToken,
        refreshToken: refreshTokenString,
      },
      sessionId: session.id,
    };
  }
}

export const authService = new AuthService();
