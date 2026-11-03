import type { Prisma, OrderStatus } from '@prisma/client';

export type PaymentStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentProvider = 'SSLCOMMERZ' | 'COD';

export type RefundStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface PaymentEntity {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: number | Prisma.Decimal | string;
  currency: string;
  transactionId: string | null;
  providerReference: string | null;
  bankTranId: string | null;
  idempotencyKey: string | null;
  paymentFee: number | Prisma.Decimal | string;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  order?: PaymentOrderReference | null;
  events?: PaymentEventEntity[];
  refunds?: RefundEntity[];
}

export interface PaymentOrderReference {
  id: string;
  orderNumber?: string;
  status: OrderStatus;
  customerId?: string | null;
  grandTotal?: number | Prisma.Decimal | string;
}

export interface PaymentEventEntity {
  id: string;
  paymentId: string;
  provider: PaymentProvider;
  eventId: string;
  eventType: string;
  rawPayloadRedacted: Record<string, unknown>;
  signatureValid: boolean;
  processedAt: Date;
  createdAt: Date;
}

export interface RefundEntity {
  id: string;
  paymentId: string;
  orderId: string;
  amount: number | Prisma.Decimal | string;
  reason: string;
  status: RefundStatus;
  processedById: string | null;
  providerRefundId: string | null;
  idempotencyKey: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GatewayInitializeInput {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  transactionId: string;
  customer: {
    id?: string;
    name: string;
    email: string;
    phone?: string;
  };
  shippingAddress: {
    address1: string;
    city: string;
    postalCode?: string;
    country?: string;
  };
}

export interface GatewayInitializeResult {
  gatewayUrl: string;
  sessionKey?: string;
  providerReference?: string;
}

export interface GatewayVerifyInput {
  valId?: string;
  transactionId?: string;
  amount?: number;
  currency?: string;
}

export interface GatewayVerifyResult {
  isValid: boolean;
  status: 'VALID' | 'FAILED' | 'CANCELLED' | 'INVALID';
  transactionId: string;
  bankTranId?: string;
  amount: number;
  currency: string;
  cardType?: string;
  cardBrand?: string;
  validationId?: string;
  rawResponse?: Record<string, unknown>;
  errorMessage?: string;
}

export interface GatewayCallbackResult {
  success: boolean;
  transactionId: string;
  valId?: string;
  status: string;
  bankTranId?: string;
  amount?: number;
  currency?: string;
  errorMessage?: string;
  rawPayload: Record<string, unknown>;
}

export interface GatewayIpnResult {
  isAuthentic: boolean;
  transactionId: string;
  valId?: string;
  status: string;
  bankTranId?: string;
  amount?: number;
  currency?: string;
  rawPayload: Record<string, unknown>;
  error?: string;
}

export interface GatewayRefundInput {
  paymentId: string;
  bankTranId: string;
  amount: number;
  reason: string;
  refundRefId: string;
}

export interface GatewayRefundResult {
  success: boolean;
  refundStatus: RefundStatus;
  providerRefundId?: string;
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;
}

export interface GatewayQueryResult {
  status: PaymentStatus;
  transactionId: string;
  bankTranId?: string;
  amount?: number;
  currency?: string;
  rawResponse?: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  initialize(input: GatewayInitializeInput): Promise<GatewayInitializeResult>;
  verify(input: GatewayVerifyInput): Promise<GatewayVerifyResult>;
  handleCallback(payload: Record<string, unknown>): Promise<GatewayCallbackResult>;
  handleIpn(payload: Record<string, unknown>): Promise<GatewayIpnResult>;
  initiateRefund(input: GatewayRefundInput): Promise<GatewayRefundResult>;
  verifyRefund(refundId: string, bankTranId?: string): Promise<GatewayRefundResult>;
  queryTransaction(transactionId: string): Promise<GatewayQueryResult>;
}

export interface InitiatePaymentDto {
  orderId: string;
  guestToken?: string;
}

export interface RefundPaymentDto {
  amount: number;
  reason: string;
  idempotencyKey?: string;
}

export interface ListPaymentsQuery {
  page?: number;
  limit?: number;
  provider?: PaymentProvider;
  status?: PaymentStatus;
  orderId?: string;
  startDate?: string;
  endDate?: string;
}
