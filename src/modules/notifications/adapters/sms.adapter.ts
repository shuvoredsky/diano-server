import { logger } from '@/utils/logger';
import type { ISmsAdapter } from '../notifications.types';

export class ConsoleSmsAdapter implements ISmsAdapter {
  async send(options: {
    to: string;
    message: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Development / Console mode: log safely without printing full phone/tokens
    const maskedTo = options.to.length > 6 ? options.to.slice(0, 4) + '***' + options.to.slice(-2) : '***';
    logger.info({ to: maskedTo, messageLength: options.message.length }, '[SMS_CONSOLE] SMS dispatched to console');
    return {
      success: true,
      messageId: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
  }
}

