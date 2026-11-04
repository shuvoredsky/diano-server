import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';
import type { IEmailAdapter } from '../notifications.types';

export class ConsoleEmailAdapter implements IEmailAdapter {
  async send(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Development / Console mode: log safely without printing secrets/tokens
    const maskedTo = options.to.length > 5 ? options.to.slice(0, 3) + '***@' + options.to.split('@')[1] : '***';
    logger.info({ to: maskedTo, subject: options.subject }, '[EMAIL_CONSOLE] Notification dispatched to console');
    return {
      success: true,
      messageId: `console_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
  }
}

export class SmtpEmailAdapter implements IEmailAdapter {
  private transporter: Transporter | null = null;

  constructor() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
  }

  async send(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.transporter) {
      return {
        success: false,
        error: 'Email adapter disabled: missing SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS)',
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown SMTP dispatch error';
      logger.error({ error: message }, 'SMTP dispatch failed');
      return {
        success: false,
        error: message,
      };
    }
  }
}

export class ResendEmailAdapter implements IEmailAdapter {
  constructor(private readonly apiKey: string | undefined = process.env.RESEND_API_KEY || env.RESEND_API_KEY) {}

  async send(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const key = this.apiKey || process.env.RESEND_API_KEY || env.RESEND_API_KEY;
    if (!key) {
      return {
        success: false,
        error: 'Email adapter disabled: missing RESEND_API_KEY',
      };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          error: `Resend API error (${res.status}): ${errorText}`,
        };
      }

      const json = (await res.json()) as { id?: string };
      return {
        success: true,
        messageId: json.id,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Resend network error';
      return {
        success: false,
        error: message,
      };
    }
  }
}

export class BrevoEmailAdapter implements IEmailAdapter {
  constructor(private readonly apiKey: string | undefined = process.env.BREVO_API_KEY || env.BREVO_API_KEY) {}

  async send(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const key = this.apiKey || process.env.BREVO_API_KEY || env.BREVO_API_KEY;
    if (!key) {
      return {
        success: false,
        error: 'Email adapter disabled: missing BREVO_API_KEY',
      };
    }

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': key,
        },
        body: JSON.stringify({
          sender: { email: env.EMAIL_FROM, name: 'Diano' },
          to: [{ email: options.to }],
          subject: options.subject,
          htmlContent: options.html,
          textContent: options.text,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          error: `Brevo API error (${res.status}): ${errorText}`,
        };
      }

      const json = (await res.json()) as { messageId?: string };
      return {
        success: true,
        messageId: json.messageId,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Brevo network error';
      return {
        success: false,
        error: message,
      };
    }
  }
}

/**
 * Factory to create email adapter based on NOTIFICATION_EMAIL_PROVIDER
 */
export function createConfiguredEmailAdapter(): IEmailAdapter {
  const provider = env.NOTIFICATION_EMAIL_PROVIDER;

  switch (provider) {
    case 'smtp':
      return new SmtpEmailAdapter();
    case 'resend':
      return new ResendEmailAdapter();
    case 'brevo':
      return new BrevoEmailAdapter();
    case 'console':
    default:
      return new ConsoleEmailAdapter();
  }
}

