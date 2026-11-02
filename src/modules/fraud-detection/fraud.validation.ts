import { z } from 'zod';

export const updateFraudRuleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(255).optional(),
  weight: z.number().int().min(0, 'Weight must be at least 0').max(100, 'Weight cannot exceed 100').optional(),
  isEnabled: z.boolean().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const fraudReviewFilterSchema = z.object({
  status: z.enum(['PENDING', 'AUTO_APPROVED', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'OTP_REQUESTED']).optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  dateFrom: z.string().datetime().optional().transform(v => (v ? new Date(v) : undefined)),
  dateTo: z.string().datetime().optional().transform(v => (v ? new Date(v) : undefined)),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const rejectFraudReviewSchema = z.object({
  reason: z.string().min(3, 'A detailed rejection reason is required'),
});

export const approveFraudReviewSchema = z.object({
  isFalsePositive: z.boolean().optional().default(false),
  note: z.string().max(255).optional(),
});

export const verifyFraudOtpSchema = z.object({
  code: z.string().length(6, 'Verification code must be exactly 6 digits').regex(/^\d+$/, 'Code must be numeric'),
});
