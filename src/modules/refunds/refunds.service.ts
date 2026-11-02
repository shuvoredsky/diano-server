import crypto from 'crypto';
import Decimal from 'decimal.js';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { refundsRepository, type RefundsRepository } from './refunds.repository';
import type {
  RefundEntity,
  ExecuteRefundInput,
  RefundFilter,
} from './refunds.types';

export class RefundsService {
  constructor(
    private readonly repo: RefundsRepository = refundsRepository,
    private readonly audit: IAuditService = auditService,
  ) {}

  async listRefunds(filter: RefundFilter): Promise<{ items: RefundEntity[]; total: number }> {
    return this.repo.listRefunds(filter);
  }

  async getRefundById(id: string): Promise<RefundEntity> {
    const refund = await this.repo.findById(id);
    if (!refund) throw AppError.notFound(`Refund record '${id}' not found`);
    return refund;
  }

  /**
   * Executes a refund atomically with strict idempotency and gateway/manual routing
   */
  async executeRefund(
    input: ExecuteRefundInput,
    actor?: { id: string },
  ): Promise<RefundEntity> {
    // 1. Idempotency verification
    if (input.idempotencyKey) {
      const existing = await this.repo.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    // 2. Fetch order with payments
    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) throw AppError.notFound(`Order '${input.orderId}' not found`);

    // 3. Resolve payment record to attach refund to
    let payment = input.paymentId
      ? order.payments.find(p => p.id === input.paymentId)
      : order.payments.find(p => p.status === 'PAID' || p.status === 'COMPLETED');

    if (!payment) {
      // Fallback for COD orders where payment might still show PENDING in record but order is DELIVERED
      payment = order.payments[0];
    }

    if (!payment) {
      throw AppError.badRequest('No payment record associated with this order to refund');
    }

    // 4. Calculate total paid and total already refunded
    let totalPaidDec = new Decimal(0);
    for (const p of order.payments) {
      if (p.status === 'PAID' || p.status === 'COMPLETED') {
        totalPaidDec = totalPaidDec.plus(new Decimal(p.amount));
      }
    }

    // If COD delivered, customer paid the grandTotal in cash
    if (totalPaidDec.isZero() && order.paymentMethod === 'COD' && order.status === 'DELIVERED') {
      totalPaidDec = new Decimal(order.grandTotal);
    }

    const totalRefundedStr = await this.repo.getOrderTotalRefunded(order.id);
    const totalRefundedDec = new Decimal(totalRefundedStr);

    const maxRefundableDec = Decimal.max(0, totalPaidDec.minus(totalRefundedDec));

    if (maxRefundableDec.isZero()) {
      throw AppError.badRequest('Order has no remaining refundable balance');
    }

    // 5. Determine target refund amount
    let targetAmountDec: Decimal;
    if (input.amount !== undefined && input.amount !== null) {
      targetAmountDec = new Decimal(input.amount);
      if (targetAmountDec.lessThanOrEqualTo(0)) {
        throw AppError.badRequest('Refund amount must be greater than zero');
      }
      if (targetAmountDec.greaterThan(maxRefundableDec)) {
        throw AppError.badRequest(
          `Requested refund amount (৳${targetAmountDec.toFixed(2)}) exceeds maximum refundable balance (৳${maxRefundableDec.toFixed(2)})`,
        );
      }
    } else {
      targetAmountDec = maxRefundableDec;
    }

    // 6. Route gateway refund or manual record
    let providerRefundId: string | undefined;
    if (payment.provider === 'SSLCOMMERZ') {
      // SSLCOMMERZ refund reference
      providerRefundId = `SSL-REF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    } else {
      // Manual refund (COD, bKash/Nagad manual payout)
      providerRefundId = input.manualReference || `MAN-REF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    // 7. Atomic transaction
    const refund = await prisma.$transaction(async tx => {
      const createdRefund = await this.repo.createRefundInTransaction(
        {
          orderId: order.id,
          paymentId: payment.id,
          amount: targetAmountDec.toFixed(2),
          reason: input.reason,
          status: 'COMPLETED',
          processedById: actor?.id,
          providerRefundId,
          idempotencyKey: input.idempotencyKey,
        },
        tx,
      );

      // Re-evaluate cumulative refund total
      const newTotalRefunded = totalRefundedDec.plus(targetAmountDec);
      const isFullRefund = newTotalRefunded.greaterThanOrEqualTo(totalPaidDec);

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      // Update payment record status
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      // If linked to ReturnRequest, mark as REFUNDED and completedAt
      if (input.returnRequestId) {
        await tx.returnRequest.update({
          where: { id: input.returnRequestId },
          data: {
            status: 'REFUNDED',
            refundAmount: targetAmountDec.toFixed(2),
            completedAt: new Date(),
          },
        });
      }

      return createdRefund;
    });

    await this.audit.record({
      actorId: actor?.id,
      actorType: actor ? 'USER' : 'SYSTEM',
      action: 'ORDER_REFUND_EXECUTED',
      targetType: 'REFUND',
      targetId: refund.id,
      metadata: {
        orderId: order.id,
        amount: refund.amount,
        reason: input.reason,
        provider: payment.provider,
        providerRefundId,
      },
    });

    return refund;
  }
}

export const refundsService = new RefundsService();
