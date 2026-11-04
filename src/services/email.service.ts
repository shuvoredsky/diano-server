import { notificationsService } from '@/modules/notifications/notifications.service';
import { logger } from '@/utils/logger';

export interface IEmailService {
  sendVerificationEmail(to: string, token: string): Promise<void>;
  sendPasswordResetEmail(to: string, token: string): Promise<void>;
  sendOtpEmail(to: string, otp: string, purpose: string): Promise<void>;
}

/**
 * Unified EmailService delegating to the notifications module.
 * Eliminates duplicate email dispatch logic and protects secrets/tokens from logs.
 */
export class UnifiedEmailService implements IEmailService {
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    logger.info({ to: to.slice(0, 3) + '***' }, '[EMAIL] Verification email queued');
    await notificationsService.sendImmediate({
      channel: 'EMAIL',
      recipient: to,
      template: 'email_verification',
      data: { token },
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    logger.info({ to: to.slice(0, 3) + '***' }, '[EMAIL] Password reset email queued');
    await notificationsService.sendImmediate({
      channel: 'EMAIL',
      recipient: to,
      template: 'password_reset',
      data: { token },
    });
  }

  async sendOtpEmail(to: string, otp: string, purpose: string): Promise<void> {
    logger.info({ to: to.slice(0, 3) + '***', purpose }, '[EMAIL] OTP email queued');
    await notificationsService.sendImmediate({
      channel: 'EMAIL',
      recipient: to,
      template: 'otp_code',
      data: { otp, purpose },
    });
  }
}

// Singleton default instance
export const emailService: IEmailService = new UnifiedEmailService();
