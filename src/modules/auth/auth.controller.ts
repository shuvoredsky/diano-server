import type { Request, Response } from 'express';
import { env } from '@/config/env.config';
import { ApiResponse } from '@/utils/api-response';
import { authService, type AuthService } from './auth.service';
import type { RequestMetadata } from './auth.types';
import {
  registerSchema,
  loginSchema,
  adminLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  sendOtpSchema,
  verifyOtpSchema,
  changePasswordSchema,
  updateProfileSchema,
} from './auth.validation';
import type { DeviceCategory } from '@prisma/client';

const REFRESH_COOKIE_NAME = 'diano_refresh_token';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  private extractMetadata(req: Request): RequestMetadata {
    const userAgent = req.headers['user-agent'] ?? '';
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip;

    let deviceCategory: DeviceCategory = 'DESKTOP';
    if (/mobile/i.test(userAgent)) {
      deviceCategory = 'MOBILE';
    } else if (/tablet|ipad/i.test(userAgent)) {
      deviceCategory = 'TABLET';
    }

    return {
      ip,
      userAgent,
      deviceCategory,
      origin: req.headers.origin,
      requestId: req.id ? String(req.id) : undefined,
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    const isProd = env.NODE_ENV === 'production';
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private clearRefreshCookie(res: Response): void {
    const isProd = env.NODE_ENV === 'production';
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/api/v1/auth',
    });
  }

  register = async (req: Request, res: Response): Promise<Response> => {
    const validatedData = registerSchema.parse(req.body);
    const meta = this.extractMetadata(req);

    const result = await this.service.register(validatedData, meta);
    this.setRefreshCookie(res, result.tokens.refreshToken);

    return ApiResponse.created(res, 'Account created successfully', {
      user: result.user,
      accessToken: result.tokens.accessToken,
    });
  };

  login = async (req: Request, res: Response): Promise<Response> => {
    const validatedData = loginSchema.parse(req.body);
    const meta = this.extractMetadata(req);

    const result = await this.service.login(validatedData, meta, false);
    this.setRefreshCookie(res, result.tokens.refreshToken);

    return ApiResponse.success(res, 'Login successful', {
      user: result.user,
      accessToken: result.tokens.accessToken,
    });
  };

  adminLogin = async (req: Request, res: Response): Promise<Response> => {
    const validatedData = adminLoginSchema.parse(req.body);
    const meta = this.extractMetadata(req);

    const result = await this.service.login(validatedData, meta, true);
    this.setRefreshCookie(res, result.tokens.refreshToken);

    return ApiResponse.success(res, 'Administrator authenticated successfully', {
      user: result.user,
      accessToken: result.tokens.accessToken,
    });
  };

  refresh = async (req: Request, res: Response): Promise<Response> => {
    const tokenFromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
    const tokenFromBody = req.body?.refreshToken;
    const refreshToken = tokenFromCookie ?? tokenFromBody;

    if (!refreshToken) {
      return ApiResponse.error(res, 'Refresh token not provided', 400);
    }

    const meta = this.extractMetadata(req);
    const result = await this.service.refresh(refreshToken, meta);
    this.setRefreshCookie(res, result.tokens.refreshToken);

    return ApiResponse.success(res, 'Tokens refreshed successfully', {
      user: result.user,
      accessToken: result.tokens.accessToken,
    });
  };

  logout = async (req: Request, res: Response): Promise<Response> => {
    const tokenFromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
    const tokenFromBody = req.body?.refreshToken;
    const refreshToken = tokenFromCookie ?? tokenFromBody;
    const sessionId = req.user?.sessionId;

    await this.service.logout(refreshToken, sessionId);
    this.clearRefreshCookie(res);

    return ApiResponse.success(res, 'Logged out successfully');
  };

  logoutAll = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized', 401);
    }

    await this.service.logoutAll(req.user.userId);
    this.clearRefreshCookie(res);

    return ApiResponse.success(res, 'All active sessions have been terminated');
  };

  forgotPassword = async (req: Request, res: Response): Promise<Response> => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await this.service.forgotPassword(email);
    return ApiResponse.success(res, result.message);
  };

  resetPassword = async (req: Request, res: Response): Promise<Response> => {
    const validatedData = resetPasswordSchema.parse(req.body);
    await this.service.resetPassword(validatedData);
    this.clearRefreshCookie(res);

    return ApiResponse.success(res, 'Password reset successful. Please sign in with your new password.');
  };

  verifyEmail = async (req: Request, res: Response): Promise<Response> => {
    const { token } = verifyEmailSchema.parse(req.body);
    await this.service.verifyEmail(token);

    return ApiResponse.success(res, 'Email address verified successfully');
  };

  sendOtp = async (req: Request, res: Response): Promise<Response> => {
    const { identifier, purpose } = sendOtpSchema.parse(req.body);
    const result = await this.service.sendOtp(identifier, purpose);

    return ApiResponse.success(res, result.message);
  };

  verifyOtp = async (req: Request, res: Response): Promise<Response> => {
    const { identifier, code, purpose } = verifyOtpSchema.parse(req.body);
    await this.service.verifyOtp(identifier, code, purpose);

    return ApiResponse.success(res, 'OTP verified successfully');
  };

  changePassword = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized', 401);
    }

    const validatedData = changePasswordSchema.parse(req.body);
    await this.service.changePassword(req.user.userId, validatedData);
    this.clearRefreshCookie(res);

    return ApiResponse.success(res, 'Password changed successfully. Other sessions terminated.');
  };

  getMe = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized', 401);
    }

    const profile = await this.service.getProfile(req.user.userId);
    return ApiResponse.success(res, 'Profile retrieved', profile);
  };

  updateMe = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized', 401);
    }

    const validatedData = updateProfileSchema.parse(req.body);
    const updated = await this.service.updateProfile(req.user.userId, validatedData);

    return ApiResponse.success(res, 'Profile updated successfully', updated);
  };

  getLoginHistory = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized', 401);
    }

    const history = await this.service.getLoginHistory(req.user.userId);
    return ApiResponse.success(res, 'Login history retrieved', history);
  };
}

export const authController = new AuthController();
