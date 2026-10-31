import { z } from 'zod';
import { PASSWORD_REGEX } from '@/utils/password.util';

export const registerSchema = z.object({
  email: z.string().email('Please provide a valid email address').trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Please provide a valid Bangladeshi phone number')
    .optional(),
  name: z.string().min(2, 'Name must be at least 2 characters long').max(100).trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(
      PASSWORD_REGEX,
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
    ),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const adminLoginSchema = z.object({
  email: z.string().email('Invalid admin email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required').trim(),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(
      PASSWORD_REGEX,
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
    ),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required').trim(),
});

export const sendOtpSchema = z.object({
  identifier: z.string().min(3, 'Identifier is required').trim().toLowerCase(),
  purpose: z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'CHECKOUT']),
});

export const verifyOtpSchema = z.object({
  identifier: z.string().min(3, 'Identifier is required').trim().toLowerCase(),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
  purpose: z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'CHECKOUT']),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(
      PASSWORD_REGEX,
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
    ),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+8801|01)[3-9]\d{8}$/, 'Please provide a valid Bangladeshi phone number')
    .optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
