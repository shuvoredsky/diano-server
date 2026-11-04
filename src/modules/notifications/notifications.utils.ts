import crypto from 'crypto';
import { env } from '@/config/env.config';
import type { NotificationTemplateName } from './notifications.types';

/**
 * Escapes characters that have special meaning in HTML to prevent XSS injection.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Checks if current time is within Asia/Dhaka quiet hours: 9:00 PM (21:00) to 9:00 AM (09:00)
 */
export function isDhakaQuietHours(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hourPart = parts.find(p => p.type === 'hour');
  const hour = hourPart ? parseInt(hourPart.value, 10) : ((date.getUTCHours() + 6) % 24);
  return hour >= 21 || hour < 9;
}

/**
 * Returns next 9:00 AM Asia/Dhaka time in UTC
 */
export function getNextDhakaQuietHoursEnd(date: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);

  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const target = new Date(date);

  if (hour >= 21) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  // 09:00 Asia/Dhaka is 03:00 UTC
  target.setUTCHours(3, 0, 0, 0);
  return target;
}

/**
 * Categorizes a template into transactional, marketing, recovery, or admin alert.
 * Transactional notifications cannot be disabled by user preferences.
 */
export type TemplateCategory = 'TRANSACTIONAL' | 'MARKETING' | 'RECOVERY' | 'ADMIN_ALERT';

export function getTemplateCategory(template: NotificationTemplateName | string): TemplateCategory {
  switch (template) {
    case 'order_placed':
    case 'order_confirmed':
    case 'order_shipped':
    case 'order_delivered':
    case 'order_cancelled':
    case 'payment_success':
    case 'payment_failed':
    case 'refund_completed':
    case 'return_status_updated':
    case 'email_verification':
    case 'password_reset':
    case 'otp_code':
      return 'TRANSACTIONAL';

    case 'abandoned_checkout_recovery':
      return 'RECOVERY';

    case 'low_stock_alert':
    case 'out_of_stock_alert':
    case 'fraud_review_alert':
    case 'new_order_admin_alert':
      return 'ADMIN_ALERT';

    default:
      return 'MARKETING';
  }
}

/**
 * Creates an HMAC-signed unsubscribe token for marketing and recovery notifications.
 */
export function generateUnsubscribeToken(userId: string, category = 'marketing'): string {
  const payload = `${userId}:${category}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET);
  hmac.update(payload);
  const sig = hmac.digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Verifies and parses an unsubscribe token.
 */
export function verifyUnsubscribeToken(token: string): { userId: string; category: string } | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = raw.split(':');
    if (parts.length !== 4) return null;

    const [userId, category, timestampStr, signature] = parts;
    if (!userId || !category || !timestampStr || !signature) return null;

    const payload = `${userId}:${category}:${timestampStr}`;

    const hmac = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET);
    hmac.update(payload);
    const expectedSig = hmac.digest('hex');

    const sigBuffer = Buffer.from(signature);
    const expectedSigBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
      return null;
    }

    return { userId, category };
  } catch {
    return null;
  }
}

