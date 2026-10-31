import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'DIANO E-Commerce API',
    version: '1.0.0',
    description: 'High-performance, secure backend API for DIANO multi-vendor e-commerce platform',
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}`,
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT access token in the Authorization header as: Bearer <token>',
      },
      CookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'diano_refresh_token',
        description: 'HttpOnly cookie containing the rotating refresh token',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          statusCode: { type: 'integer' },
          message: { type: 'string' },
          data: { type: 'object', nullable: true },
          meta: {
            type: 'object',
            properties: {
              requestId: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      UserResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string', nullable: true },
          name: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'] },
          roles: { type: 'array', items: { type: 'string' } },
        },
      },
      AuthResponseData: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/UserResponse' },
          accessToken: { type: 'string' },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['email', 'name', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', example: '+8801712345678' },
          name: { type: 'string', minLength: 2 },
          password: {
            type: 'string',
            format: 'password',
            description: 'Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character',
          },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      ForgotPasswordInput: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      ResetPasswordInput: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string', format: 'password' },
        },
      },
      VerifyEmailInput: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' },
        },
      },
      SendOtpInput: {
        type: 'object',
        required: ['identifier', 'purpose'],
        properties: {
          identifier: { type: 'string', example: 'user@example.com' },
          purpose: {
            type: 'string',
            enum: ['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'CHECKOUT'],
          },
        },
      },
      VerifyOtpInput: {
        type: 'object',
        required: ['identifier', 'code', 'purpose'],
        properties: {
          identifier: { type: 'string' },
          code: { type: 'string', example: '123456' },
          purpose: {
            type: 'string',
            enum: ['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'CHECKOUT'],
          },
        },
      },
      ChangePasswordInput: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', format: 'password' },
        },
      },
      UpdateProfileInput: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          avatarUrl: { type: 'string', format: 'uri' },
        },
      },
    },
  },
  paths: {
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new customer account',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
        },
        responses: {
          201: {
            description: 'Account registered successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
          400: { description: 'Validation error' },
          409: { description: 'Email or phone already in use' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate customer or staff with credentials',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: {
          200: {
            description: 'Authenticated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
          401: { description: 'Invalid credentials' },
          423: { description: 'Account locked due to consecutive failed attempts' },
        },
      },
    },
    '/api/v1/auth/admin/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Dedicated admin portal login (requires staff / administrative role)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: {
          200: {
            description: 'Administrator authenticated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
          401: { description: 'Invalid credentials or not an administrative account' },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate refresh token and issue a fresh access token',
        responses: {
          200: { description: 'Tokens rotated successfully' },
          401: { description: 'Invalid or reused refresh token' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke active refresh token and invalidate current session',
        responses: {
          200: { description: 'Logged out successfully' },
        },
      },
    },
    '/api/v1/auth/logout-all': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke all sessions and refresh tokens across all devices',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'All sessions terminated' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Request password reset email (enumeration safe)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ForgotPasswordInput' } } },
        },
        responses: {
          200: { description: 'Generic dispatch response' },
        },
      },
    },
    '/api/v1/auth/reset-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Reset account password using single-use verification token',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordInput' } } },
        },
        responses: {
          200: { description: 'Password reset successfully' },
          400: { description: 'Invalid or expired reset token' },
        },
      },
    },
    '/api/v1/auth/verify-email': {
      post: {
        tags: ['Authentication'],
        summary: 'Verify customer email address',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyEmailInput' } } },
        },
        responses: {
          200: { description: 'Email verified' },
          400: { description: 'Invalid or expired token' },
        },
      },
    },
    '/api/v1/auth/otp/send': {
      post: {
        tags: ['Authentication'],
        summary: 'Send 6-digit numeric OTP',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SendOtpInput' } } },
        },
        responses: {
          200: { description: 'OTP dispatched' },
        },
      },
    },
    '/api/v1/auth/otp/verify': {
      post: {
        tags: ['Authentication'],
        summary: 'Verify 6-digit numeric OTP',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyOtpInput' } } },
        },
        responses: {
          200: { description: 'OTP verified successfully' },
          400: { description: 'Invalid or expired OTP' },
        },
      },
    },
    '/api/v1/auth/change-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Change current account password',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordInput' } } },
        },
        responses: {
          200: { description: 'Password changed successfully' },
          400: { description: 'Current password incorrect' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user profile and roles',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Current profile retrieved' },
          401: { description: 'Unauthorized' },
        },
      },
      patch: {
        tags: ['Authentication'],
        summary: 'Update current user profile information',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileInput' } } },
        },
        responses: {
          200: { description: 'Profile updated' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/login-history': {
      get: {
        tags: ['Authentication'],
        summary: 'Retrieve recent login attempts and devices for the current user',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Login history list retrieved' },
          401: { description: 'Unauthorized' },
        },
      },
    },
  },
};

export const setupSwagger = (app: Express): void => {
  if (env.NODE_ENV !== 'production') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    app.get('/api/docs.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerDocument);
    });
    logger.info('Swagger documentation mounted at /api/docs');
  }
};
