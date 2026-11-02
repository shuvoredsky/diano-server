import type { OrderStatus, PaymentStatus, PaymentProvider } from '@prisma/client';

export type { OrderStatus, PaymentStatus, PaymentProvider };

export interface ShippingAddressSnapshot {
  address: string;
  district: string;
  area: string;
  zoneName?: string;
}

export interface BillingAddressSnapshot {
  address?: string;
  district?: string;
  area?: string;
}

export interface CustomerSnapshot {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  isGuest: boolean;
}

export interface OrderItemSnapshot {
  id?: string;
  variantId?: string | null;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: string;
  costPrice?: string | null;
  quantity: number;
  discount: string;
  lineTotal: string;
  attributesSnapshot?: Record<string, unknown> | null;
}

export interface OrderStatusHistoryItem {
  id: string;
  status: OrderStatus;
  changedById?: string | null;
  note?: string | null;
  createdAt: Date;
}

export interface OrderNoteItem {
  id: string;
  authorId?: string | null;
  note: string;
  isCustomerVisible: boolean;
  createdAt: Date;
}

export interface OrderPaymentItem {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: string;
  currency: string;
  transactionId?: string | null;
  paidAt?: Date | null;
  createdAt: Date;
}

export interface OrderEntity {
  id: string;
  orderNumber: string;
  idempotencyKey?: string | null;
  customerId: string | null;
  status: OrderStatus;
  subtotal: string;
  discountTotal: string;
  shippingTotal: string;
  taxTotal: string;
  grandTotal: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentProvider;
  shippingAddressSnapshot: ShippingAddressSnapshot;
  billingAddressSnapshot?: BillingAddressSnapshot | null;
  customerSnapshot: CustomerSnapshot;
  couponId?: string | null;
  notes?: string | null;
  placedAt: Date;
  paymentDeadline?: Date | null;
  confirmedAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemSnapshot[];
  statusHistory?: OrderStatusHistoryItem[];
  orderNotes?: OrderNoteItem[];
  payments?: OrderPaymentItem[];
  invoiceSnapshot?: {
    id: string;
    invoiceNumber: string;
    storeProfile: Record<string, unknown>;
    invoiceSettings: Record<string, unknown>;
    issuedAt: Date;
  } | null;
}

export interface CreateOrderInput {
  checkoutSessionId: string;
  idempotencyKey: string;
  guestSecretToken?: string;
  customerNotes?: string;
}

export interface OrderFilter {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  note?: string;
  actorId?: string;
  actorRole?: string;
}

export interface AddOrderNoteInput {
  note: string;
  isCustomerVisible?: boolean;
  authorId?: string;
}

export interface OrderTrackResult {
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  itemCount: number;
  totalAmount: string;
  shippingDistrict: string;
}

export interface IFraudAssessor {
  assessOrder(order: OrderEntity): Promise<void>;
}

export class NoopFraudAssessor implements IFraudAssessor {
  async assessOrder(): Promise<void> {
    // No-op hook point; hooked in M11 for full risk scoring
  }
}
