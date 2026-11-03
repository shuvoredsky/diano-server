export type CheckoutStatus = 'ACTIVE' | 'ABANDONED' | 'RECOVERED' | 'CONVERTED' | 'EXPIRED';
export type DeviceCategory = 'DESKTOP' | 'MOBILE' | 'TABLET' | 'OTHER';
export type CheckoutEventType =
  | 'CHECKOUT_STARTED'
  | 'CUSTOMER_INFO_ENTERED'
  | 'SHIPPING_INFO_ENTERED'
  | 'PAYMENT_METHOD_SELECTED'
  | 'CHECKOUT_STEP_COMPLETED'
  | 'CHECKOUT_ABANDONED'
  | 'ORDER_PLACED';

export type PaymentMethodProvider = 'COD' | 'SSLCOMMERZ';

export interface CheckoutSnapshotItem {
  variantId: string;
  name: string;
  sku: string;
  price: string;
  quantity: number;
  lineTotal: string;
  thumbnailUrl: string | null;
}

export interface CheckoutCustomerInfo {
  name: string;
  phone: string;
  email?: string;
  consentForRecovery?: boolean;
}

export interface CheckoutShippingAddress {
  address: string;
  district: string;
  area: string;
  zoneName?: string;
}

export interface CheckoutDeliveryMethod {
  code: string;
  name: string;
  estimatedDays?: string;
}

export interface CheckoutPaymentMethod {
  provider: PaymentMethodProvider;
}

export interface CheckoutCartSnapshot {
  cartId: string;
  items: CheckoutSnapshotItem[];
  customerInfo?: CheckoutCustomerInfo;
  shippingAddress?: CheckoutShippingAddress;
  deliveryMethod?: CheckoutDeliveryMethod;
  paymentMethod?: CheckoutPaymentMethod;
  guestSecretTokenHash?: string;
  shippingCharge: string;
  discount: string;
  tax: string;
  grandTotal: string;
  orderId?: string;
}

export interface CheckoutSessionEntity {
  id: string;
  sessionId: string;
  userId: string | null;
  status: CheckoutStatus;
  cartSnapshot: CheckoutCartSnapshot;
  checkoutValue: number;
  lastCompletedStep: string | null;
  deviceCategory: DeviceCategory;
  browser: string | null;
  ipAddress: string | null;
  consentStatus: string | null;
  lastActivityAt: Date;
  abandonedAt: Date | null;
  recoveredAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  events?: CheckoutEventEntity[];
}

export interface CheckoutEventEntity {
  id: string;
  checkoutSessionId: string;
  type: CheckoutEventType;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

export interface CheckoutSessionSummaryDto {
  sessionId: string;
  status: CheckoutStatus;
  isGuest: boolean;
  expiresAt: string;
  lastActivityAt: string;
  lastCompletedStep: string | null;
  items: CheckoutSnapshotItem[];
  customerInfo: CheckoutCustomerInfo | null;
  shippingAddress: CheckoutShippingAddress | null;
  deliveryMethod: CheckoutDeliveryMethod | null;
  paymentMethod: {
    selected: PaymentMethodProvider | null;
    availableProviders: PaymentMethodProvider[];
  };
  totals: {
    subtotal: string;
    shippingCharge: string;
    discount: string;
    tax: string;
    grandTotal: string;
  };
}

export interface ICheckoutRepository {
  findBySessionId(sessionId: string): Promise<CheckoutSessionEntity | null>;
  findActiveByCartIdOrUserId(cartId: string, userId?: string | null): Promise<CheckoutSessionEntity | null>;
  createSession(data: {
    sessionId: string;
    userId?: string | null;
    cartSnapshot: CheckoutCartSnapshot;
    checkoutValue: number;
    expiresAt: Date;
    deviceCategory?: DeviceCategory;
    browser?: string;
    ipAddress?: string;
  }): Promise<CheckoutSessionEntity>;
  updateSession(
    id: string,
    data: Partial<{
      status: CheckoutStatus;
      cartSnapshot: CheckoutCartSnapshot;
      checkoutValue: number;
      lastCompletedStep: string;
      consentStatus: string;
      lastActivityAt: Date;
      abandonedAt: Date | null;
      recoveredAt: Date | null;
      expiresAt: Date;
    }>,
  ): Promise<CheckoutSessionEntity>;
  expireSessions(ids: string[]): Promise<number>;
  recordEvent(data: {
    checkoutSessionId: string;
    type: CheckoutEventType;
    metadata?: Record<string, unknown>;
  }): Promise<CheckoutEventEntity>;
  findEventsBySessionId(checkoutSessionId: string): Promise<CheckoutEventEntity[]>;
}
