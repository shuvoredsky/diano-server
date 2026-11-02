import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import type {
  RefundEntity,
  RefundFilter,
} from './refunds.types';

export class RefundsRepository {
  formatRefund(row: {
    id: string;
    paymentId: string;
    orderId: string;
    amount: { toString(): string };
    reason: string;
    status: RefundEntity['status'];
    processedById: string | null;
    providerRefundId: string | null;
    idempotencyKey: string | null;
    processedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): RefundEntity {
    return {
      id: row.id,
      paymentId: row.paymentId,
      orderId: row.orderId,
      amount: new Decimal(row.amount.toString()).toFixed(2),
      reason: row.reason,
      status: row.status,
      processedById: row.processedById,
      providerRefundId: row.providerRefundId,
      idempotencyKey: row.idempotencyKey,
      processedAt: row.processedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<RefundEntity | null> {
    const row = await prisma.refund.findUnique({
      where: { id },
    });
    return row ? this.formatRefund(row) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<RefundEntity | null> {
    const row = await prisma.refund.findUnique({
      where: { idempotencyKey },
    });
    return row ? this.formatRefund(row) : null;
  }

  async listRefunds(filter: RefundFilter): Promise<{ items: RefundEntity[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RefundWhereInput = {};
    if (filter.orderId) where.orderId = filter.orderId;
    if (filter.paymentId) where.paymentId = filter.paymentId;
    if (filter.status) where.status = filter.status;

    const [rows, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.refund.count({ where }),
    ]);

    return {
      items: rows.map(r => this.formatRefund(r)),
      total,
    };
  }

  async getOrderTotalRefunded(orderId: string): Promise<string> {
    const refunds = await prisma.refund.findMany({
      where: { orderId, status: { in: ['COMPLETED', 'PROCESSING', 'APPROVED'] } },
      select: { amount: true },
    });

    let totalDec = new Decimal(0);
    for (const r of refunds) {
      totalDec = totalDec.plus(new Decimal(r.amount));
    }
    return totalDec.toFixed(2);
  }

  async createRefundInTransaction(
    data: {
      orderId: string;
      paymentId: string;
      amount: string;
      reason: string;
      status: RefundEntity['status'];
      processedById?: string;
      providerRefundId?: string;
      idempotencyKey?: string;
    },
    tx: Prisma.TransactionClient = prisma,
  ): Promise<RefundEntity> {
    const row = await tx.refund.create({
      data: {
        orderId: data.orderId,
        paymentId: data.paymentId,
        amount: data.amount,
        reason: data.reason,
        status: data.status,
        processedById: data.processedById ?? null,
        providerRefundId: data.providerRefundId ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
        processedAt: new Date(),
      },
    });

    return this.formatRefund(row);
  }
}

export const refundsRepository = new RefundsRepository();
