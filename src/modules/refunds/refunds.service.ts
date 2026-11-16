import Decimal from 'decimal.js';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { auditService, type IAuditService } from '@/services/audit.service';
import { sslcommerzGateway } from '@/modules/payments/gateways/sslcommerz.gateway';
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
   * Executes a refund atomically with pessimistic row lock, strictly capped balance re-verification,
   * idempotency protection, and real gateway or manual routing (no simulated fake IDs).
   */
  async executeRefund(
    input: ExecuteRefundInput,
    actor?: { id: string },
  ): Promise<RefundEntity> {
    const effectiveIdempotencyKey =
      input.idempotencyKey ||
      (input.returnRequestId ? `return-refund-${input.returnRequestId}` : undefined);

    // 1. Fast idempotency pre-check
    if (effectiveIdempotencyKey) {
      const existing = await this.repo.findByIdempotencyKey(effectiveIdempotencyKey);
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
      payment = order.payments[0];
    }

    if (!payment) {
      throw AppError.badRequest('No payment record associated with this order to refund');
    }

    // 4. Calculate total paid
    let totalPaidDec = new Decimal(0);
    for (const p of order.payments) {
      if (p.status === 'PAID' || p.status === 'COMPLETED') {
        totalPaidDec = totalPaidDec.plus(new Decimal(p.amount.toString()));
      }
    }

    // If COD delivered, customer paid the grandTotal in cash
    if (totalPaidDec.isZero() && order.paymentMethod === 'COD' && order.status === 'DELIVERED') {
      totalPaidDec = new Decimal(order.grandTotal.toString());
    }

    if (totalPaidDec.isZero()) {
      throw AppError.badRequest('Cannot process refund for order with zero paid amount');
    }

    // 5. Atomic transaction with pessimistic row locking and re-read
    const refund = await prisma.$transaction(async tx => {
      // Lock Order row to serialize concurrent refund requests on the same order
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE
      `;
      if (payment) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE
        `;
      }

      // Idempotency re-check under lock
      if (effectiveIdempotencyKey) {
        const existingInTx = await tx.refund.findUnique({
          where: { idempotencyKey: effectiveIdempotencyKey },
        });
        if (existingInTx) {
          return this.repo.formatRefund(existingInTx);
        }
      }

      // If linked to return request, re-verify status under lock
      if (input.returnRequestId) {
        const returnReq = await tx.returnRequest.findUnique({
          where: { id: input.returnRequestId },
        });
        if (!returnReq) {
          throw AppError.notFound(`Return request '${input.returnRequestId}' not found`);
        }
        if (returnReq.status === 'REFUNDED') {
          throw AppError.badRequest(`Return request '${input.returnRequestId}' has already been refunded`);
        }
      }

      // Re-read prior refunds under lock
      const priorRefunds = await tx.refund.findMany({
        where: {
          orderId: order.id,
          status: { in: ['COMPLETED', 'PROCESSING', 'APPROVED'] },
        },
        select: { amount: true },
      });

      let currentTotalRefundedDec = new Decimal(0);
      for (const r of priorRefunds) {
        currentTotalRefundedDec = currentTotalRefundedDec.plus(new Decimal(r.amount.toString()));
      }

      const maxRefundableDec = Decimal.max(0, totalPaidDec.minus(currentTotalRefundedDec));

      if (maxRefundableDec.lessThanOrEqualTo(0)) {
        throw AppError.badRequest('Order has no remaining refundable balance');
      }

      // Determine target refund amount
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

      // Gateway vs manual resolution (no simulated fake IDs)
      let providerRefundId: string | null;
      let finalStatus: 'COMPLETED' | 'PENDING' | 'PROCESSING';

      if (payment.provider === 'SSLCOMMERZ') {
        if (input.manualReference) {
          // Manual settlement of an online payment order
          providerRefundId = input.manualReference;
          finalStatus = input.status === 'PENDING' ? 'PENDING' : 'COMPLETED';
        } else {
          // Real SSLCOMMERZ gateway call
          if (!payment.bankTranId) {
            throw AppError.badRequest(
              'Missing bankTranId on payment required for SSLCOMMERZ gateway refund. Provide manualReference to record as manual refund.',
            );
          }
          const refundRefId = effectiveIdempotencyKey || `REF-${payment.id.slice(-6)}-${Date.now()}`;
          const gatewayResult = await sslcommerzGateway.initiateRefund({
            paymentId: payment.id,
            bankTranId: payment.bankTranId,
            amount: targetAmountDec.toNumber(),
            reason: input.reason,
            refundRefId,
          });

          if (!gatewayResult.success) {
            throw AppError.badGateway(
              `SSLCOMMERZ refund rejected: ${gatewayResult.errorMessage || 'Gateway connection error'}`,
            );
          }

          providerRefundId = gatewayResult.providerRefundId || refundRefId;
          finalStatus = gatewayResult.refundStatus === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING';
        }
      } else {
        // COD or manual offline payment
        if (input.status === 'PENDING') {
          providerRefundId = input.manualReference || 'PENDING_MANUAL';
          finalStatus = 'PENDING';
        } else {
          providerRefundId = input.manualReference || `MANUAL-COD-${Date.now()}`;
          finalStatus = 'COMPLETED';
        }
      }

      // Create refund row in database
      const createdRefund = await tx.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          amount: targetAmountDec.toFixed(2),
          reason: input.reason,
          status: finalStatus,
          processedById: actor?.id ?? null,
          providerRefundId,
          idempotencyKey: effectiveIdempotencyKey ?? null,
          processedAt: new Date(),
          completedAt: finalStatus === 'COMPLETED' ? new Date() : null,
        },
      });

      // Update Order & Payment status ONLY when actually completed
      if (finalStatus === 'COMPLETED') {
        const newTotalRefunded = currentTotalRefundedDec.plus(targetAmountDec);
        const isFullRefund = newTotalRefunded.greaterThanOrEqualTo(totalPaidDec);

        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        });

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
      } else {
        // Pending manual or processing
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'REFUND_PENDING',
          },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'REFUND_PENDING',
          },
        });
      }

      return this.repo.formatRefund(createdRefund);
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
        status: refund.status,
        provider: payment.provider,
        providerRefundId: refund.providerRefundId,
      },
    });

    return refund;
  }
}

export const refundsService = new RefundsService();
