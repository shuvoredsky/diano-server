import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '@/modules/auth/auth.service';
import type { IAuthRepository, UserWithRoles, RequestMetadata } from '@/modules/auth/auth.types';
import type { IEmailService } from '@/services/email.service';
import type { IAuditService } from '@/services/audit.service';
import { hashPassword } from '@/utils/password.util';
import * as passwordUtil from '@/utils/password.util';
import { hashToken } from '@/utils/token.util';

describe('AuthService (Unit Tests with Mocked Repository)', () => {
  let authService: AuthService;
  let mockRepo: vi.Mocked<IAuthRepository>;
  let mockEmailSvc: vi.Mocked<IEmailService>;
  let mockAuditSvc: vi.Mocked<IAuditService>;

  const mockMeta: RequestMetadata = {
    ip: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    deviceCategory: 'DESKTOP',
  };

  const createMockUser = (overrides: Partial<UserWithRoles> = {}): UserWithRoles => ({
    id: 'user_cuid_1',
    email: 'test@example.com',
    phone: '+8801712345678',
    passwordHash: '',
    name: 'Test Customer',
    status: 'ACTIVE',
    isEmailVerified: false,
    isPhoneVerified: false,
    failedLoginAttempts: 0,
    lockUntil: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    roles: [
      {
        role: {
          id: 'role_1',
          name: 'Customer',
          slug: 'customer',
          type: 'SYSTEM',
        },
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    mockRepo = {
      findUserByEmail: vi.fn(),
      findUserByPhone: vi.fn(),
      findUserById: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      incrementFailedLogin: vi.fn(),
      resetFailedLogin: vi.fn(),
      createSession: vi.fn().mockResolvedValue({
        id: 'session_cuid_1',
        userId: 'user_cuid_1',
        tokenHash: 'hash',
        deviceCategory: 'DESKTOP',
        browser: null,
        os: null,
        ip: '127.0.0.1',
        userAgent: null,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findSessionById: vi.fn(),
      findSessionByTokenHash: vi.fn(),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
      createRefreshToken: vi.fn().mockResolvedValue({
        id: 'refresh_cuid_1',
        userId: 'user_cuid_1',
        tokenHash: 'hash',
        familyId: 'family_1',
        isRevoked: false,
        usedAt: null,
        replacedByTokenId: null,
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
      }),
      findRefreshTokenByHash: vi.fn(),
      markRefreshTokenUsed: vi.fn().mockResolvedValue(undefined),
      revokeRefreshTokenFamily: vi.fn().mockResolvedValue(undefined),
      createLoginHistory: vi.fn().mockResolvedValue(undefined),
      getLoginHistory: vi.fn().mockResolvedValue([]),
      createEmailVerificationToken: vi.fn().mockResolvedValue(undefined),
      findEmailVerificationToken: vi.fn(),
      deleteEmailVerificationToken: vi.fn().mockResolvedValue(undefined),
      createPasswordResetToken: vi.fn().mockResolvedValue(undefined),
      findPasswordResetToken: vi.fn(),
      deletePasswordResetToken: vi.fn().mockResolvedValue(undefined),
      createOtpCode: vi.fn().mockResolvedValue(undefined),
      findLatestValidOtp: vi.fn(),
      incrementOtpAttempts: vi.fn().mockResolvedValue(undefined),
      markOtpUsed: vi.fn().mockResolvedValue(undefined),
    };

    mockEmailSvc = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
      sendOtpEmail: vi.fn().mockResolvedValue(undefined),
    };

    mockAuditSvc = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(mockRepo, mockEmailSvc, mockAuditSvc);
  });

  describe('Registration', () => {
    it('should successfully register a customer and return tokens', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);
      mockRepo.findUserByPhone.mockResolvedValue(null);

      const fakeUser = createMockUser();
      mockRepo.createUser.mockResolvedValue(fakeUser);

      const result = await authService.register(
        {
          email: 'newuser@example.com',
          name: 'New User',
          password: 'Password123!',
          phone: '+8801712345678',
        },
        mockMeta,
      );

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.user.email).toBe(fakeUser.email);
      expect(mockRepo.createUser).toHaveBeenCalled();
      expect(mockRepo.createEmailVerificationToken).toHaveBeenCalled();
      expect(mockEmailSvc.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should reject registration if email is already registered', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(createMockUser());

      await expect(
        authService.register(
          {
            email: 'test@example.com',
            name: 'Another User',
            password: 'Password123!',
          },
          mockMeta,
        ),
      ).rejects.toThrowError('An account with this email address already exists');
    });

    it('should reject registration if phone is already registered', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);
      mockRepo.findUserByPhone.mockResolvedValue(createMockUser());

      await expect(
        authService.register(
          {
            email: 'brandnew@example.com',
            phone: '+8801712345678',
            name: 'Another User',
            password: 'Password123!',
          },
          mockMeta,
        ),
      ).rejects.toThrowError('An account with this phone number already exists');
    });
  });

  describe('Login & Security Policies', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      const password = 'Password123!';
      const hash = await hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      mockRepo.findUserByEmail.mockResolvedValue(user);

      const result = await authService.login({ email: user.email, password }, mockMeta);

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(mockRepo.createLoginHistory).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SUCCESS' }),
      );
    });

    it('should throw generic error and record failed attempt on wrong password', async () => {
      const password = 'Password123!';
      const hash = await hashPassword(password);
      const user = createMockUser({ passwordHash: hash, failedLoginAttempts: 0 });

      mockRepo.findUserByEmail.mockResolvedValue(user);

      await expect(
        authService.login({ email: user.email, password: 'WrongPassword123!' }, mockMeta),
      ).rejects.toThrowError('Invalid email or password');

      expect(mockRepo.incrementFailedLogin).toHaveBeenCalledWith(user.id, undefined);
      expect(mockRepo.createLoginHistory).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED', reason: 'Invalid credentials' }),
      );
    });

    it('should lock account when reaching maximum failed login attempts', async () => {
      const password = 'Password123!';
      const hash = await hashPassword(password);
      // 4 previous failed attempts, this 5th one triggers lockout
      const user = createMockUser({ passwordHash: hash, failedLoginAttempts: 4 });

      mockRepo.findUserByEmail.mockResolvedValue(user);

      await expect(
        authService.login({ email: user.email, password: 'WrongPassword123!' }, mockMeta),
      ).rejects.toThrowError('Invalid email or password');

      expect(mockRepo.incrementFailedLogin).toHaveBeenCalledWith(
        user.id,
        expect.any(Date), // lockUntil timestamp
      );
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_LOCKED' }),
      );
    });

    it('should prevent login if account is currently locked', async () => {
      const lockedUser = createMockUser({
        lockUntil: new Date(Date.now() + 10 * 60 * 1000), // locked for next 10 mins
      });

      mockRepo.findUserByEmail.mockResolvedValue(lockedUser);

      await expect(
        authService.login({ email: lockedUser.email, password: 'Password123!' }, mockMeta),
      ).rejects.toThrowError(/temporarily locked/);
    });

    it('should rehash password on login if cost factor is outdated', async () => {
      const password = 'Password123!';
      const hash = await hashPassword(password);
      const user = createMockUser({ passwordHash: hash });

      mockRepo.findUserByEmail.mockResolvedValue(user);

      const spy = vi.spyOn(passwordUtil, 'needsRehash').mockReturnValueOnce(true);

      await authService.login({ email: user.email, password }, mockMeta);

      expect(mockRepo.updateUser).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ passwordHash: expect.any(String) }),
      );

      spy.mockRestore();
    });

    it('should allow admin login only for administrative roles', async () => {
      const password = 'Password123!';
      const hash = await hashPassword(password);
      const adminUser = createMockUser({
        passwordHash: hash,
        roles: [{ role: { id: 'r1', name: 'Super Admin', slug: 'super-admin', type: 'SYSTEM' } }],
      });

      mockRepo.findUserByEmail.mockResolvedValue(adminUser);

      const result = await authService.login({ email: adminUser.email, password }, mockMeta, true);
      expect(result.tokens.accessToken).toBeDefined();
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_LOGIN' }),
      );
    });

    it('should reject admin login attempt with customer account', async () => {
      const password = 'Password123!';
      const hash = await hashPassword(password);
      const customerUser = createMockUser({ passwordHash: hash });

      mockRepo.findUserByEmail.mockResolvedValue(customerUser);

      await expect(
        authService.login({ email: customerUser.email, password }, mockMeta, true),
      ).rejects.toThrowError('Access denied. Administrator privileges required.');
    });

    it('should reject administrative accounts on public customer login endpoint', async () => {
      const password = 'Password123!';
      const hash = await hashPassword(password);
      const adminUser = createMockUser({
        passwordHash: hash,
        roles: [{ role: { id: 'r1', name: 'Super Admin', slug: 'super-admin', type: 'SYSTEM' } }],
      });

      mockRepo.findUserByEmail.mockResolvedValue(adminUser);

      await expect(
        authService.login({ email: adminUser.email, password }, mockMeta, false),
      ).rejects.toThrowError(/Administrative accounts must authenticate via the administrative portal/);
    });
  });

  describe('Refresh Token Rotation & Reuse Detection', () => {
    it('should rotate refresh token and return fresh credentials', async () => {
      const rawRefreshToken = 'opaque-raw-token-string';
      const tokenHash = hashToken(rawRefreshToken);

      mockRepo.findRefreshTokenByHash.mockResolvedValue({
        id: 'token_1',
        userId: 'user_cuid_1',
        tokenHash,
        familyId: 'family_1',
        isRevoked: false,
        usedAt: null,
        replacedByTokenId: null,
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
      });

      mockRepo.findUserById.mockResolvedValue(createMockUser());

      const result = await authService.refresh(rawRefreshToken, mockMeta);

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(mockRepo.markRefreshTokenUsed).toHaveBeenCalledWith('token_1', expect.any(String));
      expect(mockRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ familyId: 'family_1' }),
      );
    });

    it('should detect token reuse, revoke entire family, and throw unauthorized', async () => {
      const reusedToken = 'reused-token-string';
      const tokenHash = hashToken(reusedToken);

      // Token already has usedAt set!
      mockRepo.findRefreshTokenByHash.mockResolvedValue({
        id: 'compromised_token',
        userId: 'user_cuid_1',
        tokenHash,
        familyId: 'family_1',
        isRevoked: false,
        usedAt: new Date(Date.now() - 5000), // ALREADY USED
        replacedByTokenId: 'token_2',
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
      });

      await expect(authService.refresh(reusedToken, mockMeta)).rejects.toThrowError(
        /Refresh token reuse detected/,
      );

      // Must revoke the ENTIRE family to neutralize attacker
      expect(mockRepo.revokeRefreshTokenFamily).toHaveBeenCalledWith('family_1');
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFRESH_TOKEN_REUSE_DETECTED' }),
      );
    });
  });

  describe('Logout & Session Invalidation', () => {
    it('should revoke token family and session on logout', async () => {
      const token = 'token-to-revoke';
      mockRepo.findRefreshTokenByHash.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        tokenHash: hashToken(token),
        familyId: 'fam_1',
        isRevoked: false,
        usedAt: null,
        replacedByTokenId: null,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      await authService.logout(token, 'session_1');

      expect(mockRepo.revokeRefreshTokenFamily).toHaveBeenCalledWith('fam_1');
      expect(mockRepo.revokeSession).toHaveBeenCalledWith('session_1');
    });

    it('should revoke all user sessions and record audit on logoutAll', async () => {
      await authService.logoutAll('user_cuid_1');

      expect(mockRepo.revokeAllUserSessions).toHaveBeenCalledWith('user_cuid_1');
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGOUT_ALL_SESSIONS' }),
      );
    });
  });

  describe('Password Reset (Single-Use)', () => {
    it('should return generic success message on forgotPassword (anti-enumeration)', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);
      const res1 = await authService.forgotPassword('nonexistent@example.com');
      expect(res1.message).toContain('If an account exists');

      mockRepo.findUserByEmail.mockResolvedValue(createMockUser());
      const res2 = await authService.forgotPassword('test@example.com');
      expect(res2.message).toContain('If an account exists');
      expect(mockRepo.createPasswordResetToken).toHaveBeenCalled();
      expect(mockEmailSvc.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should reset password, delete single-use token, and terminate all active sessions', async () => {
      const resetToken = 'valid-reset-token';
      mockRepo.findPasswordResetToken.mockResolvedValue({
        id: 'reset_id_1',
        userId: 'user_cuid_1',
        tokenHash: hashToken(resetToken),
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      });

      await authService.resetPassword({
        token: resetToken,
        newPassword: 'BrandNewPassword123!',
      });

      expect(mockRepo.updateUser).toHaveBeenCalledWith(
        'user_cuid_1',
        expect.objectContaining({ passwordHash: expect.any(String) }),
      );
      // Single-use guarantee: deleted immediately
      expect(mockRepo.deletePasswordResetToken).toHaveBeenCalledWith('reset_id_1');
      // All existing sessions revoked
      expect(mockRepo.revokeAllUserSessions).toHaveBeenCalledWith('user_cuid_1');
      expect(mockAuditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET' }),
      );
    });
  });

  describe('Email Verification & OTP', () => {
    it('should verify email and delete token', async () => {
      const token = 'valid-verify-token';
      mockRepo.findEmailVerificationToken.mockResolvedValue({
        id: 'evt_1',
        userId: 'user_cuid_1',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      });

      await authService.verifyEmail(token);

      expect(mockRepo.updateUser).toHaveBeenCalledWith('user_cuid_1', { isEmailVerified: true });
      expect(mockRepo.deleteEmailVerificationToken).toHaveBeenCalledWith('evt_1');
    });

    it('should verify correct OTP code', async () => {
      const code = '123456';
      mockRepo.findLatestValidOtp.mockResolvedValue({
        id: 'otp_1',
        identifier: 'test@example.com',
        codeHash: hashToken(code),
        purpose: 'LOGIN',
        attempts: 0,
        maxAttempts: 3,
        isUsed: false,
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      });

      await authService.verifyOtp('test@example.com', code, 'LOGIN');
      expect(mockRepo.markOtpUsed).toHaveBeenCalledWith('otp_1');
    });

    it('should block OTP verification when max attempts exceeded', async () => {
      mockRepo.findLatestValidOtp.mockResolvedValue({
        id: 'otp_1',
        identifier: 'test@example.com',
        codeHash: hashToken('123456'),
        purpose: 'LOGIN',
        attempts: 3,
        maxAttempts: 3,
        isUsed: false,
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      });

      await expect(
        authService.verifyOtp('test@example.com', '123456', 'LOGIN'),
      ).rejects.toThrowError(/Maximum verification attempts exceeded/);
    });
  });
});
