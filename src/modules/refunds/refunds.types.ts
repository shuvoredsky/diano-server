import type { RefundStatus } from '@prisma/client';

export interface RefundEntity {
  id: string;
  paymentId: string;
  orderId: string;
  amount: string;
  reason: string;
  status: RefundStatus;
  processedById: string | null;
  providerRefundId: string | null;
  idempotencyKey: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReturnItemForRefund {
  orderItemId: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface ProportionalRefundInput {
  orderSubtotal: string;
  orderDiscountTotal: string;
  orderShippingTotal: string;
  orderTotalPaid: string;
  orderTotalRefunded: string;
  returnedItems: ReturnItemForRefund[];
  includeShipping?: boolean;
}

export interface ProportionalRefundResult {
  totalRefundAmount: string;
  itemsRefundAmount: string;
  shippingRefundAmount: string;
  maxRefundableAmount: string;
  breakdown: Array<{
    orderItemId: string;
    lineTotal: string;
    proportionalDiscount: string;
    refundableAmount: string;
  }>;
}

export interface ExecuteRefundInput {
  paymentId?: string;
  orderId: string;
  amount?: string | number;
  reason: string;
  returnRequestId?: string;
  refundShipping?: boolean;
  manualReference?: string;
  idempotencyKey?: string;
}

export interface RefundFilter {
  orderId?: string;
  paymentId?: string;
  status?: RefundStatus;
  page?: number;
  limit?: number;
}
