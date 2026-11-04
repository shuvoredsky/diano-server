import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeHtml,
  isDhakaQuietHours,
  getNextDhakaQuietHoursEnd,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  getTemplateCategory,
} from '@/modules/notifications/notifications.utils';
import { renderTemplate } from '@/modules/notifications/templates';
import {
  SmtpEmailAdapter,
  ResendEmailAdapter,
  BrevoEmailAdapter,
  ConsoleEmailAdapter,
} from '@/modules/notifications/adapters/email.adapter';
import { ConsoleSmsAdapter } from '@/modules/notifications/adapters/sms.adapter';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import type { INotificationsRepository } from '@/modules/notifications/notifications.repository';
import type { NotificationEntity, NotificationPreferenceEntity } from '@/modules/notifications/notifications.types';

describe('Notifications Unit Tests', () => {
  describe('HTML Escaping & Sanitization', () => {
    it('escapes dangerous HTML characters to prevent XSS in email templates', () => {
      const malicious = '<script>alert("XSS")</script>&foo=\'bar\'';
      const escaped = escapeHtml(malicious);

      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).toContain('&quot;XSS&quot;');
      expect(escaped).toContain('&amp;foo=&#39;bar&#39;');
    });

    it('handles null and undefined gracefully', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(12345)).toBe('12345');
    });
  });

  describe('Template Rendering (i18n & variable substitution)', () => {
    it('renders English order_placed template with escaped parameters', () => {
      const rendered = renderTemplate(
        'order_placed',
        {
          orderNumber: 'ORD-1001',
          totalAmount: '2,500.00',
          itemsCount: 3,
        },
        'en',
      );

      expect(rendered.subject).toBe('Your Diano Order #ORD-1001 has been placed');
      expect(rendered.html).toContain('ORD-1001');
      expect(rendered.html).toContain('৳2,500.00');
      expect(rendered.text).toContain('ORD-1001');
    });

    it('renders Bengali order_placed template with correct text', () => {
      const rendered = renderTemplate(
        'order_placed',
        {
          orderNumber: 'ORD-1002',
          totalAmount: '3,000.00',
          itemsCount: 2,
        },
        'bn',
      );

      expect(rendered.subject).toContain('আপনার ডিয়ানো অর্ডার #ORD-1002 সফলভাবে গ্রহণ করা হয়েছে');
      expect(rendered.html).toContain('মোট ৳3,000.00');
    });

    it('renders OTP template without leaking token in unexpected formats', () => {
      const rendered = renderTemplate(
        'otp_code',
        {
          otp: '482910',
          purpose: 'Login verification',
        },
        'en',
      );

      expect(rendered.subject).toContain('482910');
      expect(rendered.html).toContain('482910');
      expect(rendered.text).toContain('Login verification');
    });

    it('renders abandoned checkout recovery with unsubscribe link', () => {
      const rendered = renderTemplate(
        'abandoned_checkout_recovery',
        {
          customerName: 'Rahim',
          recoveryUrl: 'https://diano.com/checkout?session=123',
        },
        'en',
        'user-abc-123',
      );

      expect(rendered.subject).toContain('Rahim, you left items in your cart!');
      expect(rendered.html).toContain('https://diano.com/notifications/unsubscribe?token=');
      expect(rendered.html).toContain('Unsubscribe');
    });
  });

  describe('Asia/Dhaka Quiet Hours (9:00 PM - 9:00 AM)', () => {
    it('identifies 22:30 Dhaka as quiet hours', () => {
      // 22:30 Dhaka (UTC+6) is 16:30 UTC
      const date = new Date('2026-11-04T16:30:00Z');
      expect(isDhakaQuietHours(date)).toBe(true);
    });

    it('identifies 04:00 Dhaka as quiet hours', () => {
      // 04:00 Dhaka (UTC+6) is 22:00 UTC (previous day)
      const date = new Date('2026-11-03T22:00:00Z');
      expect(isDhakaQuietHours(date)).toBe(true);
    });

    it('identifies 14:00 Dhaka as non-quiet business hours', () => {
      // 14:00 Dhaka (UTC+6) is 08:00 UTC
      const date = new Date('2026-11-04T08:00:00Z');
      expect(isDhakaQuietHours(date)).toBe(false);
    });

    it('calculates next 09:00 AM Dhaka end time in UTC (03:00 UTC)', () => {
      const eveningDate = new Date('2026-11-04T16:00:00Z'); // 22:00 Dhaka
      const nextEnd = getNextDhakaQuietHoursEnd(eveningDate);

      expect(nextEnd.getUTCHours()).toBe(3); // 09:00 Dhaka is 03:00 UTC
      expect(nextEnd.getUTCMinutes()).toBe(0);
    });
  });

  describe('Unsubscribe HMAC Signature', () => {
    it('generates and verifies valid unsubscribe token', () => {
      const token = generateUnsubscribeToken('user-123', 'marketing');
      const verified = verifyUnsubscribeToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe('user-123');
      expect(verified?.category).toBe('marketing');
    });

    it('rejects tampered unsubscribe token', () => {
      const token = generateUnsubscribeToken('user-123', 'marketing');
      const tampered = token.slice(0, -4) + 'abcd';
      const verified = verifyUnsubscribeToken(tampered);

      expect(verified).toBeNull();
    });

    it('rejects malformed token strings', () => {
      expect(verifyUnsubscribeToken('not-a-token')).toBeNull();
      expect(verifyUnsubscribeToken('')).toBeNull();
    });
  });

  describe('Template Category Mapping', () => {
    it('correctly maps transactional templates that cannot be disabled', () => {
      expect(getTemplateCategory('order_placed')).toBe('TRANSACTIONAL');
      expect(getTemplateCategory('order_shipped')).toBe('TRANSACTIONAL');
      expect(getTemplateCategory('payment_success')).toBe('TRANSACTIONAL');
      expect(getTemplateCategory('email_verification')).toBe('TRANSACTIONAL');
      expect(getTemplateCategory('password_reset')).toBe('TRANSACTIONAL');
      expect(getTemplateCategory('otp_code')).toBe('TRANSACTIONAL');
    });

    it('correctly maps marketing and recovery templates', () => {
      expect(getTemplateCategory('abandoned_checkout_recovery')).toBe('RECOVERY');
      expect(getTemplateCategory('promotional_blast')).toBe('MARKETING');
    });
  });

  describe('Adapters Disabled Mode without Credentials', () => {
    it('SmtpEmailAdapter returns disabled error when SMTP credentials missing', async () => {
      const adapter = new SmtpEmailAdapter();
      const result = await adapter.send({
        to: 'customer@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email adapter disabled: missing SMTP credentials');
    });

    it('ResendEmailAdapter returns disabled error when RESEND_API_KEY missing', async () => {
      const adapter = new ResendEmailAdapter();
      const result = await adapter.send({
        to: 'customer@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email adapter disabled: missing RESEND_API_KEY');
    });

    it('BrevoEmailAdapter returns disabled error when BREVO_API_KEY missing', async () => {
      const adapter = new BrevoEmailAdapter();
      const result = await adapter.send({
        to: 'customer@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email adapter disabled: missing BREVO_API_KEY');
    });

    it('ConsoleEmailAdapter returns simulated success with masked recipient', async () => {
      const adapter = new ConsoleEmailAdapter();
      const result = await adapter.send({
        to: 'customer@example.com',
        subject: 'Test Console',
        html: '<p>Console</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toContain('console_');
    });

    it('ConsoleSmsAdapter returns simulated success', async () => {
      const adapter = new ConsoleSmsAdapter();
      const result = await adapter.send({
        to: '+8801711223344',
        message: 'Your Diano order has been confirmed',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toContain('sms_');
    });
  });

  describe('HTTP Mock for External Email Providers', () => {
    beforeEach(() => {
      vi.stubEnv('RESEND_API_KEY', 're_test_key_12345');
      vi.stubEnv('BREVO_API_KEY', 'xkeysib_test_key_12345');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('ResendEmailAdapter sends via mocked HTTP fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'resend_msg_998877' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ResendEmailAdapter();
      const result = await adapter.send({
        to: 'buyer@example.com',
        subject: 'Order Details',
        html: '<p>Hi</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('resend_msg_998877');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer re_test_key_12345',
          }),
        }),
      );
    });

    it('BrevoEmailAdapter sends via mocked HTTP fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: 'brevo_msg_554433' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new BrevoEmailAdapter();
      const result = await adapter.send({
        to: 'buyer@example.com',
        subject: 'Order Shipped',
        html: '<p>Shipped</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('brevo_msg_554433');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'api-key': 'xkeysib_test_key_12345',
          }),
        }),
      );
    });
  });

  describe('User Preference Enforcement in NotificationsService', () => {
    it('suppresses marketing email if user opted out of email marketing', async () => {
      const mockRepo: Partial<INotificationsRepository> = {
        getPreferences: vi.fn().mockResolvedValue({
          id: 'pref-1',
          userId: 'user-1',
          emailMarketing: false,
          smsMarketing: true,
          orderUpdates: true,
          promotionalPush: true,
          smsRecovery: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as NotificationPreferenceEntity),
        createNotification: vi.fn(),
      };

      const service = new NotificationsService(mockRepo as INotificationsRepository);

      const res = await service.notify({
        channel: 'EMAIL',
        recipient: 'customer@example.com',
        userId: 'user-1',
        template: 'promotional_blast' as any,
        data: { message: 'Discount sale' },
      });

      expect(res).toBeNull();
      expect(mockRepo.createNotification).not.toHaveBeenCalled();
    });

    it('never suppresses transactional notifications even if marketing is false', async () => {
      const mockRepo: Partial<INotificationsRepository> = {
        getPreferences: vi.fn().mockResolvedValue({
          id: 'pref-1',
          userId: 'user-1',
          emailMarketing: false,
          smsMarketing: false,
          orderUpdates: true,
          promotionalPush: false,
          smsRecovery: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as NotificationPreferenceEntity),
        createNotification: vi.fn().mockResolvedValue({
          id: 'notif-1',
          status: 'PENDING',
        } as NotificationEntity),
      };

      const service = new NotificationsService(mockRepo as INotificationsRepository);

      const res = await service.notify({
        channel: 'EMAIL',
        recipient: 'customer@example.com',
        userId: 'user-1',
        template: 'order_placed',
        data: { orderNumber: 'ORD-999', totalAmount: '1200' },
      });

      expect(res).not.toBeNull();
      expect(mockRepo.createNotification).toHaveBeenCalled();
    });
  });
});

