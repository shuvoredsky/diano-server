import type { ReturnStatus } from '@prisma/client';

export interface ReturnRequestEntity {
  id: string;
  returnNumber: string;
  orderId: string;
  customerId: string;
  status: ReturnStatus;
  refundAmount: string | null;
  reasonId: string | null;
  customerNote: string | null;
  staffNote: string | null;
  requestedAt: Date;
  inspectedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items?: ReturnItemEntity[];
  reason?: ReturnReasonEntity | null;
}

export interface ReturnItemEntity {
  id: string;
  returnRequestId: string;
  orderItemId: string;
  quantity: number;
  condition: string | null;
  action: string | null;
  createdAt: Date;
  orderItem?: {
    id: string;
    productName: string;
    variantName: string;
    sku: string;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
    variantId: string | null;
  };
}

export interface ReturnReasonEntity {
  id: string;
  reason: string;
  code: string;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateReturnRequestInput {
  items: Array<{
    orderItemId: string;
    quantity: number;
    reasonId?: string;
    reasonCode?: string;
  }>;
  customerNote?: string;
  reasonId?: string;
}

export interface ReviewReturnInput {
  action: 'APPROVE' | 'REJECT';
  staffNote?: string;
}

export interface ReceiveReturnItemInput {
  itemId: string;
  condition: 'GOOD' | 'DAMAGED';
  action: 'REFUND' | 'REPLACE' | 'REJECT';
  warehouseId?: string;
}

export interface ReceiveReturnInput {
  items: ReceiveReturnItemInput[];
  staffNote?: string;
  includeShippingRefund?: boolean;
}

export interface ReturnFilter {
  orderId?: string;
  customerId?: string;
  status?: ReturnStatus;
  page?: number;
  limit?: number;
}
