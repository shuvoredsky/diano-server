import type { Prisma, PurchaseOrderStatus } from '@prisma/client';

export interface PurchaseOrderItemEntity {
  id: string;
  purchaseOrderId: string;
  variantId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  lineTotal: number;
  createdAt: Date;
  updatedAt: Date;
  variant?: {
    id: string;
    sku: string;
    name: string;
    costPrice: number | null;
  };
}

export interface PurchaseOrderEntity {
  id: string;
  poNumber: string;
  supplierId: string;
  warehouseId: string | null;
  status: PurchaseOrderStatus;
  totalAmount: number;
  orderedAt: Date | null;
  expectedDeliveryDate: Date | null;
  receivedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  supplier?: {
    id: string;
    name: string;
    code: string;
    phone: string | null;
  };
  warehouse?: {
    id: string;
    name: string;
    code: string;
  } | null;
  items?: PurchaseOrderItemEntity[];
}

export interface CreatePoItemInput {
  variantId: string;
  orderedQuantity: number;
  unitCost: number;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  warehouseId?: string;
  expectedDeliveryDate?: Date;
  notes?: string;
  items: CreatePoItemInput[];
}

export interface ReceivePoItemInput {
  variantId: string;
  quantity: number;
}

export interface ReceivePurchaseOrderDto {
  items: ReceivePoItemInput[];
  notes?: string;
}

export interface PurchaseOrderFilterQuery {
  page?: number;
  limit?: number;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  warehouseId?: string;
  variantId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface IPurchaseOrdersRepository {
  listPurchaseOrders(
    filter: PurchaseOrderFilterQuery,
  ): Promise<{ items: PurchaseOrderEntity[]; total: number }>;
  findPurchaseOrderById(id: string, tx?: Prisma.TransactionClient): Promise<PurchaseOrderEntity | null>;
  findPurchaseOrderByPoNumber(poNumber: string): Promise<PurchaseOrderEntity | null>;
  createPurchaseOrder(data: {
    poNumber: string;
    supplierId: string;
    warehouseId: string | null;
    status: PurchaseOrderStatus;
    totalAmount: number;
    expectedDeliveryDate?: Date;
    notes?: string;
    items: CreatePoItemInput[];
  }): Promise<PurchaseOrderEntity>;
  updateStatus(
    id: string,
    status: PurchaseOrderStatus,
    extraData?: { orderedAt?: Date; receivedAt?: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<PurchaseOrderEntity>;
  updateReceivedQuantity(
    itemId: string,
    receivedQuantity: number,
    tx?: Prisma.TransactionClient,
  ): Promise<PurchaseOrderItemEntity>;
}
