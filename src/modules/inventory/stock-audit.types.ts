import type { Prisma } from '@prisma/client';

export interface StockAuditItemEntity {
  id: string;
  auditId: string;
  variantId: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  variant?: {
    id: string;
    sku: string;
    name: string;
  };
}

export interface StockAuditEntity {
  id: string;
  warehouseId: string;
  auditorId: string;
  status: string; // IN_PROGRESS, APPROVED, REJECTED, COMPLETED
  discrepanciesFound: number;
  notes: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  warehouse?: {
    id: string;
    name: string;
    code: string;
  };
  items?: StockAuditItemEntity[];
}

export interface StartAuditInput {
  warehouseId: string;
  auditorId: string;
  notes?: string;
}

export interface AuditCountEntryInput {
  variantId: string;
  countedQuantity: number;
  notes?: string;
}

export interface RecordAuditCountsInput {
  auditId: string;
  items: AuditCountEntryInput[];
}

export interface IStockAuditRepository {
  createAudit(input: StartAuditInput): Promise<StockAuditEntity>;
  findAuditById(id: string, tx?: Prisma.TransactionClient): Promise<StockAuditEntity | null>;
  listAudits(warehouseId?: string): Promise<StockAuditEntity[]>;
  upsertAuditItem(data: {
    auditId: string;
    variantId: string;
    systemQuantity: number;
    countedQuantity: number;
    variance: number;
    notes?: string;
  }): Promise<StockAuditItemEntity>;
  updateAuditStatus(
    id: string,
    status: string,
    discrepanciesFound?: number,
    completedAt?: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<StockAuditEntity>;
}
