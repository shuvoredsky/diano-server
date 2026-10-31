import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';

export interface IEmailService {
  sendVerificationEmail(to: string, token: string): Promise<void>;
  sendPasswordResetEmail(to: string, token: string): Promise<void>;
  sendOtpEmail(to: string, otp: string, purpose: string): Promise<void>;
}

export class ConsoleEmailService implements IEmailService {
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verificationUrl = `https://diano.com/verify-email?token=${token}`;
    if (env.NODE_ENV !== 'production') {
      logger.info({ to, token, verificationUrl }, '[DEV EMAIL] Verification email dispatched');
    } else {
      logger.info({ to }, '[EMAIL] Verification email sent');
    }
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `https://diano.com/reset-password?token=${token}`;
    if (env.NODE_ENV !== 'production') {
      logger.info({ to, token, resetUrl }, '[DEV EMAIL] Password reset email dispatched');
    } else {
      logger.info({ to }, '[EMAIL] Password reset email sent');
    }
  }

  async sendOtpEmail(to: string, otp: string, purpose: string): Promise<void> {
    if (env.NODE_ENV !== 'production') {
      logger.info({ to, otp, purpose }, '[DEV EMAIL] OTP email dispatched');
    } else {
      logger.info({ to, purpose }, '[EMAIL] OTP email sent');
    }
  }
}

// Singleton default instance
export const emailService: IEmailService = new ConsoleEmailService();
