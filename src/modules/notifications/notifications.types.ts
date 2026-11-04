export type NotificationChannel = 'EMAIL' | 'SMS' | 'IN_APP' | 'PUSH';

export type NotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'DEAD';

export type NotificationTemplateName =
  | 'order_placed'
  | 'order_confirmed'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'payment_success'
  | 'payment_failed'
  | 'refund_completed'
  | 'return_status_updated'
  | 'email_verification'
  | 'password_reset'
  | 'otp_code'
  | 'abandoned_checkout_recovery'
  | 'low_stock_alert'
  | 'out_of_stock_alert'
  | 'fraud_review_alert'
  | 'new_order_admin_alert';

export type SupportedLocale = 'en' | 'bn';

export interface NotificationEntity {
  id: string;
  userId: string | null;
  channel: NotificationChannel;
  recipient: string;
  template: string;
  subject: string | null;
  content: string;
  metadata: Record<string, unknown>;
  status: NotificationStatus;
  dedupeKey: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  readAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotifyInput {
  channel: NotificationChannel;
  recipient: string;
  template: NotificationTemplateName;
  data: Record<string, unknown>;
  userId?: string | null;
  dedupeKey?: string;
  locale?: SupportedLocale;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface IEmailAdapter {
  send(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export interface ISmsAdapter {
  send(options: {
    to: string;
    message: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export interface NotificationPreferenceEntity {
  id: string;
  userId: string;
  emailMarketing: boolean;
  smsMarketing: boolean;
  orderUpdates: boolean;
  promotionalPush: boolean;
  smsRecovery: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdatePreferencesInput {
  emailMarketing?: boolean;
  smsMarketing?: boolean;
  orderUpdates?: boolean;
  promotionalPush?: boolean;
  smsRecovery?: boolean;
}

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  template?: string;
  recipient?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}

