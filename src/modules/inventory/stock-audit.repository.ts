import { prisma } from '@/config/database';
import type {
  IStockAuditRepository,
  StockAuditEntity,
  StockAuditItemEntity,
  StartAuditInput,
} from './stock-audit.types';

export class StockAuditRepository implements IStockAuditRepository {
  async createAudit(input: StartAuditInput): Promise<StockAuditEntity> {
    const created = await prisma.stockAudit.create({
      data: {
        warehouseId: input.warehouseId,
        auditorId: input.auditorId,
        notes: input.notes ?? null,
        status: 'IN_PROGRESS',
      },
      include: {
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true },
            },
          },
        },
      },
    });

    return created as unknown as StockAuditEntity;
  }

  async findAuditById(id: string): Promise<StockAuditEntity | null> {
    const audit = await prisma.stockAudit.findUnique({
      where: { id },
      include: {
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true },
            },
          },
        },
      },
    });

    return audit as unknown as StockAuditEntity | null;
  }

  async listAudits(warehouseId?: string): Promise<StockAuditEntity[]> {
    const audits = await prisma.stockAudit.findMany({
      where: warehouseId ? { warehouseId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true },
            },
          },
        },
      },
    });

    return audits as unknown as StockAuditEntity[];
  }

  async upsertAuditItem(data: {
    auditId: string;
    variantId: string;
    systemQuantity: number;
    countedQuantity: number;
    variance: number;
    notes?: string;
  }): Promise<StockAuditItemEntity> {
    const item = await prisma.stockAuditItem.upsert({
      where: {
        auditId_variantId: {
          auditId: data.auditId,
          variantId: data.variantId,
        },
      },
      update: {
        systemQuantity: data.systemQuantity,
        countedQuantity: data.countedQuantity,
        variance: data.variance,
        notes: data.notes ?? null,
      },
      create: {
        auditId: data.auditId,
        variantId: data.variantId,
        systemQuantity: data.systemQuantity,
        countedQuantity: data.countedQuantity,
        variance: data.variance,
        notes: data.notes ?? null,
      },
      include: {
        variant: {
          select: { id: true, sku: true, name: true },
        },
      },
    });

    return item as unknown as StockAuditItemEntity;
  }

  async updateAuditStatus(
    id: string,
    status: string,
    discrepanciesFound?: number,
    completedAt?: Date,
  ): Promise<StockAuditEntity> {
    const updated = await prisma.stockAudit.update({
      where: { id },
      data: {
        status,
        ...(discrepanciesFound !== undefined ? { discrepanciesFound } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
      },
      include: {
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true },
            },
          },
        },
      },
    });

    return updated as unknown as StockAuditEntity;
  }
}

export const stockAuditRepository = new StockAuditRepository();
