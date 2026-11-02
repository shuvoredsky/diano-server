import Decimal from 'decimal.js';
import { prisma } from '@/config/database';
import type { Prisma, ReturnStatus } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import type {
  ReturnRequestEntity,
  ReturnItemEntity,
  ReturnReasonEntity,
  ReturnFilter,
} from './returns.types';

export class ReturnsRepository {
  async getNextReturnNumber(tx: Prisma.TransactionClient = prisma): Promise<string> {
    const datePrefix = formatInTimeZone(new Date(), 'Asia/Dhaka', 'yyMMdd');
    const seqKey = `RETURN-${datePrefix}`;

    const seqResult = await tx.$queryRaw<Array<{ lastValue: number }>>`
      INSERT INTO "AppSequence" ("key", "lastValue", "updatedAt")
      VALUES (${seqKey}, 1, NOW())
      ON CONFLICT ("key")
      DO UPDATE SET "lastValue" = "AppSequence"."lastValue" + 1, "updatedAt" = NOW()
      RETURNING "lastValue"
    `;

    const seq = seqResult[0]?.lastValue ?? 1;
    return `RET-${datePrefix}-${String(seq).padStart(5, '0')}`;
  }

  formatReturn(row: {
    id: string;
    returnNumber: string;
    orderId: string;
    customerId: string;
    status: ReturnStatus;
    refundAmount: { toString(): string } | null;
    reasonId: string | null;
    customerNote: string | null;
    staffNote: string | null;
    requestedAt: Date;
    inspectedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    items?: Array<{
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
        unitPrice: { toString(): string };
        quantity: number;
        lineTotal: { toString(): string };
        variantId: string | null;
      };
    }>;
    reason?: {
      id: string;
      reason: string;
      code: string;
      isActive: boolean;
      createdAt: Date;
    } | null;
  }): ReturnRequestEntity {
    return {
      id: row.id,
      returnNumber: row.returnNumber,
      orderId: row.orderId,
      customerId: row.customerId,
      status: row.status,
      refundAmount: row.refundAmount ? new Decimal(row.refundAmount.toString()).toFixed(2) : null,
      reasonId: row.reasonId,
      customerNote: row.customerNote,
      staffNote: row.staffNote,
      requestedAt: row.requestedAt,
      inspectedAt: row.inspectedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      reason: row.reason
        ? {
            id: row.reason.id,
            reason: row.reason.reason,
            code: row.reason.code,
            isActive: row.reason.isActive,
            createdAt: row.reason.createdAt,
          }
        : null,
      items: row.items?.map(i => ({
        id: i.id,
        returnRequestId: i.returnRequestId,
        orderItemId: i.orderItemId,
        quantity: i.quantity,
        condition: i.condition,
        action: i.action,
        createdAt: i.createdAt,
        orderItem: i.orderItem
          ? {
              id: i.orderItem.id,
              productName: i.orderItem.productName,
              variantName: i.orderItem.variantName,
              sku: i.orderItem.sku,
              unitPrice: i.orderItem.unitPrice.toString(),
              quantity: i.orderItem.quantity,
              lineTotal: i.orderItem.lineTotal.toString(),
              variantId: i.orderItem.variantId,
            }
          : undefined,
      })),
    };
  }

  async findById(id: string): Promise<ReturnRequestEntity | null> {
    const row = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        items: {
          include: { orderItem: true },
        },
        reason: true,
      },
    });

    return row ? this.formatReturn(row) : null;
  }

  async listReturns(filter: ReturnFilter): Promise<{ items: ReturnRequestEntity[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReturnRequestWhereInput = {};
    if (filter.orderId) where.orderId = filter.orderId;
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.status) where.status = filter.status;

    const [rows, total] = await Promise.all([
      prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            include: { orderItem: true },
          },
          reason: true,
        },
      }),
      prisma.returnRequest.count({ where }),
    ]);

    return {
      items: rows.map(r => this.formatReturn(r)),
      total,
    };
  }

  async getAlreadyReturnedQuantity(orderItemId: string): Promise<number> {
    const items = await prisma.returnItem.findMany({
      where: {
        orderItemId,
        returnRequest: {
          status: { notIn: ['REJECTED', 'CANCELLED'] },
        },
      },
      select: { quantity: true },
    });

    return items.reduce((acc, curr) => acc + curr.quantity, 0);
  }

  async createReturnRequest(data: {
    orderId: string;
    customerId: string;
    reasonId?: string;
    customerNote?: string;
    items: Array<{ orderItemId: string; quantity: number }>;
  }): Promise<ReturnRequestEntity> {
    return prisma.$transaction(async tx => {
      const returnNumber = await this.getNextReturnNumber(tx);

      const row = await tx.returnRequest.create({
        data: {
          returnNumber,
          orderId: data.orderId,
          customerId: data.customerId,
          reasonId: data.reasonId ?? null,
          customerNote: data.customerNote ?? null,
          status: 'REQUESTED',
          items: {
            create: data.items.map(item => ({
              orderItemId: item.orderItemId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: { include: { orderItem: true } },
          reason: true,
        },
      });

      return this.formatReturn(row);
    });
  }

  async updateReturnRequest(
    id: string,
    data: Prisma.ReturnRequestUpdateInput,
  ): Promise<ReturnRequestEntity> {
    const row = await prisma.returnRequest.update({
      where: { id },
      data,
      include: {
        items: { include: { orderItem: true } },
        reason: true,
      },
    });

    return this.formatReturn(row);
  }

  async updateReturnItem(
    id: string,
    data: Prisma.ReturnItemUpdateInput,
  ): Promise<ReturnItemEntity> {
    const row = await prisma.returnItem.update({
      where: { id },
      data,
      include: { orderItem: true },
    });

    return {
      id: row.id,
      returnRequestId: row.returnRequestId,
      orderItemId: row.orderItemId,
      quantity: row.quantity,
      condition: row.condition,
      action: row.action,
      createdAt: row.createdAt,
      orderItem: row.orderItem
        ? {
            id: row.orderItem.id,
            productName: row.orderItem.productName,
            variantName: row.orderItem.variantName,
            sku: row.orderItem.sku,
            unitPrice: row.orderItem.unitPrice.toString(),
            quantity: row.orderItem.quantity,
            lineTotal: row.orderItem.lineTotal.toString(),
            variantId: row.orderItem.variantId,
          }
        : undefined,
    };
  }

  async listActiveReasons(): Promise<ReturnReasonEntity[]> {
    const rows = await prisma.returnReason.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(r => ({
      id: r.id,
      reason: r.reason,
      code: r.code,
      isActive: r.isActive,
      createdAt: r.createdAt,
    }));
  }
}

export const returnsRepository = new ReturnsRepository();
