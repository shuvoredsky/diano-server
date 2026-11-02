import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { assertValidTransition } from '@/modules/orders/orders.state-machine';
import { assertValidPaymentTransition } from './payments.state-machine';
import { redactPaymentPayload } from './payments.redact';
import type {
  PaymentEntity,
  PaymentEventEntity,
  RefundEntity,
  PaymentStatus,
  PaymentProvider,
  RefundStatus,
  ListPaymentsQuery,
} from './payments.types';

const TX_OPTIONS = { maxWait: 15000, timeout: 25000 };

export class PaymentsRepository {
  /**
   * Creates a new Payment record in the database.
   */
  async createPayment(data: {
    orderId: string;
    provider: PaymentProvider;
    status: PaymentStatus;
    amount: number;
    currency: string;
    transactionId: string;
    providerReference?: string;
    idempotencyKey?: string;
  }): Promise<PaymentEntity> {
    const payment = await prisma.payment.create({
      data: {
        orderId: data.orderId,
        provider: data.provider,
        status: data.status,
        amount: data.amount,
        currency: data.currency,
        transactionId: data.transactionId,
        providerReference: data.providerReference,
        idempotencyKey: data.idempotencyKey,
      },
    });

    return payment as unknown as PaymentEntity;
  }

  /**
   * Finds payment by its ID with relations.
   */
  async findById(id: string): Promise<PaymentEntity | null> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            items: true,
            customer: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
        },
        refunds: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return payment as unknown as PaymentEntity | null;
  }

  /**
   * Finds payment by provider and transactionId.
   */
  async findByTransactionId(
    provider: PaymentProvider,
    transactionId: string,
  ): Promise<PaymentEntity | null> {
    const payment = await prisma.payment.findUnique({
      where: {
        provider_transactionId: {
          provider,
          transactionId,
        },
      },
      include: {
        order: {
          include: {
            items: true,
            customer: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        },
        events: true,
        refunds: true,
      },
    });

    return payment as unknown as PaymentEntity | null;
  }

  /**
   * Finds any active payment attempt for an order (INITIATED, PENDING, or PROCESSING).
   */
  async findActivePaymentForOrder(orderId: string): Promise<PaymentEntity | null> {
    const payment = await prisma.payment.findFirst({
      where: {
        orderId,
        status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payment as unknown as PaymentEntity | null;
  }

  /**
   * Finds all payments for an order.
   */
  async findAllByOrderId(orderId: string): Promise<PaymentEntity[]> {
    const payments = await prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return payments as unknown as PaymentEntity[];
  }

  /**
   * Updates payment status and optional metadata fields.
   */
  async updatePayment(
    id: string,
    data: {
      status?: PaymentStatus;
      bankTranId?: string;
      paidAt?: Date;
      failureReason?: string;
      providerReference?: string;
    },
  ): Promise<PaymentEntity> {
    const payment = await prisma.payment.update({
      where: { id },
      data,
    });

    return payment as unknown as PaymentEntity;
  }

  /**
   * Records a payment event (IPN / Webhook / Callback).
   * Safe against replay attacks due to unique (provider, eventId) constraint.
   */
  async recordPaymentEvent(data: {
    paymentId: string;
    provider: PaymentProvider;
    eventId: string;
    eventType: string;
    rawPayload: Record<string, any>;
    signatureValid?: boolean;
  }): Promise<{ event: PaymentEventEntity | null; isDuplicate: boolean }> {
    const redactedPayload = redactPaymentPayload(data.rawPayload);

    const existing = await prisma.paymentEvent.findUnique({
      where: {
        provider_eventId: {
          provider: data.provider,
          eventId: data.eventId,
        },
      },
    });

    if (existing) {
      return { event: existing as unknown as PaymentEventEntity, isDuplicate: true };
    }

    try {
      const event = await prisma.paymentEvent.create({
        data: {
          paymentId: data.paymentId,
          provider: data.provider,
          eventId: data.eventId,
          eventType: data.eventType,
          rawPayloadRedacted: redactedPayload as Prisma.InputJsonValue,
          signatureValid: data.signatureValid ?? true,
        },
      });

      return { event: event as unknown as PaymentEventEntity, isDuplicate: false };
    } catch (err: any) {
      if (err.code === 'P2002') {
        return { event: null, isDuplicate: true };
      }
      throw err;
    }
  }

  /**
   * Atomically executes the PAID transition in a single database transaction:
   * 1. Verifies current payment status (idempotency guard)
   * 2. Payment -> PAID, bankTranId, paidAt
   * 3. Order.paymentStatus -> PAID, Order.status -> CONFIRMED
   * 4. Commits reserved stock via inventoryService.commitReservation
   * 5. Records OrderStatusHistory
   * 6. Records AuditLog
   * 7. Records PaymentEvent
   */
  async markPaymentPaidInTransaction(params: {
    paymentId: string;
    bankTranId?: string;
    cardType?: string;
    eventId: string;
    eventType: string;
    rawPayload: Record<string, any>;
    actorContext?: { id?: string; actorType?: 'USER' | 'SYSTEM' | 'WEBHOOK' };
  }): Promise<{ payment: PaymentEntity; alreadyPaid: boolean }> {
    return await prisma.$transaction(async tx => {
      // 1. Fetch current payment with order details inside transaction
      const payment = await tx.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          order: {
            include: { items: true },
          },
        },
      });

      if (!payment) {
        throw new Error(`Payment '${params.paymentId}' not found`);
      }

      // Idempotent guard: if already PAID, return without duplicate side effects
      if (payment.status === 'PAID') {
        // Record event if not already present
        const existingEvent = await tx.paymentEvent.findUnique({
          where: {
            provider_eventId: {
              provider: payment.provider,
              eventId: params.eventId,
            },
          },
        });

        if (!existingEvent) {
          const redacted = redactPaymentPayload(params.rawPayload);
          await tx.paymentEvent.create({
            data: {
              paymentId: payment.id,
              provider: payment.provider,
              eventId: params.eventId,
              eventType: params.eventType,
              rawPayloadRedacted: redacted as Prisma.InputJsonValue,
              signatureValid: true,
            },
          });
        }

        return { payment: payment as unknown as PaymentEntity, alreadyPaid: true };
      }

      // Assert state machine transition
      assertValidPaymentTransition(payment.status as PaymentStatus, 'PAID');

      // 2. Update Payment
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          bankTranId: params.bankTranId || payment.bankTranId,
          paidAt: new Date(),
        },
      });

      // 3. Update Order
      const order = payment.order;
      if (order.status === 'PENDING') {
        assertValidTransition('PENDING', 'CONFIRMED');

        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        });

        // 4. Commit reserved stock for online payment
        const defaultWarehouse = await tx.warehouse.findFirst({
          where: { isDefault: true, isActive: true },
        });
        const warehouseId = defaultWarehouse?.id || 'WH-DHK-01';

        for (const item of order.items) {
          if (item.variantId) {
            await inventoryService.commitReservation(
              {
                variantId: item.variantId,
                warehouseId,
                quantity: item.quantity,
                referenceType: 'ORDER',
                referenceId: order.orderNumber,
                actorId: params.actorContext?.id,
                reason: `Payment confirmed online (${payment.provider})`,
              },
              tx,
            );
          }
        }

        // 5. OrderStatusHistory
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: 'CONFIRMED',
            changedById: params.actorContext?.id || null,
            note: `Payment verified via ${payment.provider} (TranID: ${payment.transactionId})`,
          },
        });
      } else {
        // If order was already confirmed or in progress, update paymentStatus
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
          },
        });
      }

      // 6. AuditLog
      await tx.auditLog.create({
        data: {
          actorId: params.actorContext?.id || null,
          actorType: (params.actorContext?.actorType as any) || 'WEBHOOK',
          action: 'PAYMENT_PAID',
          targetType: 'PAYMENT',
          targetId: payment.id,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            provider: payment.provider,
            amount: Number(payment.amount),
            bankTranId: params.bankTranId,
          } as Prisma.InputJsonValue,
        },
      });

      // 7. PaymentEvent
      const existingEvent = await tx.paymentEvent.findUnique({
        where: {
          provider_eventId: {
            provider: payment.provider,
            eventId: params.eventId,
          },
        },
      });

      if (!existingEvent) {
        const redacted = redactPaymentPayload(params.rawPayload);
        await tx.paymentEvent.create({
          data: {
            paymentId: payment.id,
            provider: payment.provider,
            eventId: params.eventId,
            eventType: params.eventType,
            rawPayloadRedacted: redacted as Prisma.InputJsonValue,
            signatureValid: true,
          },
        });
      }

      return { payment: updatedPayment as unknown as PaymentEntity, alreadyPaid: false };
    }, TX_OPTIONS);
  }

  /**
   * Atomically executes FAILED / CANCELLED transition and releases reserved stock.
   */
  async markPaymentFailedInTransaction(params: {
    paymentId: string;
    status: 'FAILED' | 'CANCELLED';
    reason: string;
    eventId: string;
    eventType: string;
    rawPayload: Record<string, any>;
    actorContext?: { id?: string; actorType?: 'USER' | 'SYSTEM' | 'WEBHOOK' };
  }): Promise<PaymentEntity> {
    return await prisma.$transaction(async tx => {
      const payment = await tx.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          order: {
            include: { items: true },
          },
        },
      });

      if (!payment) {
        throw new Error(`Payment '${params.paymentId}' not found`);
      }

      if (['FAILED', 'CANCELLED'].includes(payment.status)) {
        return payment as unknown as PaymentEntity;
      }

      assertValidPaymentTransition(payment.status as PaymentStatus, params.status);

      // Update payment
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: params.status,
          failureReason: params.reason,
        },
      });

      // Release stock reservation if order is still PENDING
      const order = payment.order;
      if (order.status === 'PENDING') {
        const defaultWarehouse = await tx.warehouse.findFirst({
          where: { isDefault: true, isActive: true },
        });
        const warehouseId = defaultWarehouse?.id || 'WH-DHK-01';

        for (const item of order.items) {
          if (item.variantId) {
            await inventoryService.releaseReservation(
              {
                variantId: item.variantId,
                warehouseId,
                quantity: item.quantity,
                referenceType: 'ORDER',
                referenceId: order.orderNumber,
                actorId: params.actorContext?.id,
                reason: `Payment attempt ${params.status.toLowerCase()} (${params.reason})`,
              },
              tx,
            );
          }
        }
      }

      // Record event
      const existingEvent = await tx.paymentEvent.findUnique({
        where: {
          provider_eventId: {
            provider: payment.provider,
            eventId: params.eventId,
          },
        },
      });

      if (!existingEvent) {
        const redacted = redactPaymentPayload(params.rawPayload);
        await tx.paymentEvent.create({
          data: {
            paymentId: payment.id,
            provider: payment.provider,
            eventId: params.eventId,
            eventType: params.eventType,
            rawPayloadRedacted: redacted as Prisma.InputJsonValue,
            signatureValid: false,
          },
        });
      }

      return updatedPayment as unknown as PaymentEntity;
    }, TX_OPTIONS);
  }

  /**
   * Creates a refund record and updates payment refund status.
   */
  async createRefund(data: {
    paymentId: string;
    orderId: string;
    amount: number;
    reason: string;
    status: RefundStatus;
    processedById?: string;
    providerRefundId?: string;
    idempotencyKey?: string;
  }): Promise<RefundEntity> {
    const refund = await prisma.refund.create({
      data: {
        paymentId: data.paymentId,
        orderId: data.orderId,
        amount: data.amount,
        reason: data.reason,
        status: data.status,
        processedById: data.processedById,
        providerRefundId: data.providerRefundId,
        idempotencyKey: data.idempotencyKey,
        processedAt: data.status === 'COMPLETED' ? new Date() : null,
      },
    });

    return refund as unknown as RefundEntity;
  }

  /**
   * Paginated list of payments for admin dashboard.
   */
  async findPayments(query: ListPaymentsQuery): Promise<{ payments: PaymentEntity[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};
    if (query.provider) where.provider = query.provider;
    if (query.status) where.status = query.status;
    if (query.orderId) where.orderId = query.orderId;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              grandTotal: true,
              status: true,
              customerId: true,
            },
          },
          refunds: true,
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments: payments as unknown as PaymentEntity[],
      total,
    };
  }

  /**
   * Finds pending payments older than specified milliseconds for reconciliation.
   */
  async findPendingPaymentsForReconciliation(olderThanMs: number): Promise<PaymentEntity[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const payments = await prisma.payment.findMany({
      where: {
        status: { in: ['INITIATED', 'PENDING'] },
        createdAt: { lte: cutoff },
      },
      include: {
        order: {
          include: { items: true },
        },
      },
    });

    return payments as unknown as PaymentEntity[];
  }
}

export const paymentsRepository = new PaymentsRepository();
