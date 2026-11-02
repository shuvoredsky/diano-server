import { prisma } from '@/config/database';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import { logger } from '@/utils/logger';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { paymentsRepository as defaultRepo, type PaymentsRepository } from './payments.repository';
import { paymentGatewayRegistry as defaultRegistry, type PaymentGatewayRegistry } from './gateways/gateway.registry';
import { assertValidPaymentTransition } from './payments.state-machine';
import type {
  InitiatePaymentDto,
  PaymentEntity,
  PaymentProvider,
  RefundPaymentDto,
  RefundEntity,
  ListPaymentsQuery,
} from './payments.types';

export class PaymentsService {
  constructor(
    private readonly repo: PaymentsRepository = defaultRepo,
    private readonly registry: PaymentGatewayRegistry = defaultRegistry,
  ) {}

  /**
   * Initiates payment for a customer order.
   * Strict validation:
   * - Order must be PENDING, unpaid, and have an online payment method.
   * - Amounts & currency are fetched directly from order server-side.
   * - No two concurrent attempts can be active at once.
   * - Retries allowed only if all previous attempts are FAILED, CANCELLED, or EXPIRED.
   */
  async initiatePayment(
    dto: InitiatePaymentDto,
    actorContext: { userId?: string; guestToken?: string },
  ): Promise<{ paymentId: string; transactionId: string; gatewayUrl: string }> {
    const order = await prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: true,
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    if (!order) {
      throw AppError.notFound('Order not found');
    }

    // 1. Authorization & IDOR guard
    const customerSnapshot = order.customerSnapshot as Record<string, unknown> | null;
    const isOwner = actorContext.userId && order.customerId === actorContext.userId;
    const isGuestOwner =
      dto.guestToken &&
      (customerSnapshot?.guestToken === dto.guestToken ||
        actorContext.guestToken === dto.guestToken);

    if (!isOwner && !isGuestOwner) {
      throw AppError.forbidden('You do not have permission to pay for this order');
    }

    // 2. Order status and payment state guards
    if (order.status !== 'PENDING') {
      throw AppError.badRequest(`Cannot initiate payment for order in '${order.status}' status`);
    }

    if (order.paymentStatus === 'PAID') {
      throw AppError.badRequest('Order has already been paid');
    }

    if (order.paymentMethod === 'COD') {
      throw AppError.badRequest('Online payment cannot be initiated for Cash on Delivery (COD) orders');
    }

    // 3. Attempt concurrency and retry rules
    const existingPayments = await this.repo.findAllByOrderId(order.id);

    // Check if any attempt is already PAID
    const paidAttempt = existingPayments.find(p => ['PAID', 'COMPLETED'].includes(p.status));
    if (paidAttempt) {
      throw AppError.badRequest('A successful payment already exists for this order');
    }

    // Check if any active attempt is in progress
    const activeAttempt = existingPayments.find(p =>
      ['INITIATED', 'PENDING', 'PROCESSING'].includes(p.status),
    );
    if (activeAttempt) {
      throw AppError.conflict(
        'A payment attempt is already active for this order. Please complete or cancel it before retrying.',
      );
    }

    // If all previous attempts are FAILED, CANCELLED, or EXPIRED, re-reserve stock atomically if needed
    if (existingPayments.length > 0) {
      const defaultWarehouse = await prisma.warehouse.findFirst({
        where: { isDefault: true, isActive: true },
      });
      const warehouseId = defaultWarehouse?.id || 'WH-DHK-01';

      try {
        await prisma.$transaction(async tx => {
          for (const item of order.items) {
            if (item.variantId) {
              await inventoryService.reserveStock(
                {
                  variantId: item.variantId,
                  warehouseId,
                  quantity: item.quantity,
                  referenceType: 'ORDER',
                  referenceId: order.orderNumber,
                  reason: `Stock re-reserved for payment retry (${order.orderNumber})`,
                },
                tx,
              );
            }
          }
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw AppError.badRequest(`Insufficient stock to retry payment: ${message}`);
      }
    }

    // 4. Generate unique transactionId
    const attemptNumber = existingPayments.length + 1;
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const transactionId = `${order.orderNumber}-P${attemptNumber}-${randomSuffix}`;

    const amount = Number(order.grandTotal);
    const currency = 'BDT';

    // 5. Create Payment record in INITIATED state
    const payment = await this.repo.createPayment({
      orderId: order.id,
      provider: order.paymentMethod as PaymentProvider,
      status: 'INITIATED',
      amount,
      currency,
      transactionId,
    });

    // 6. Fetch provider gateway from registry
    const gateway = this.registry.getGateway(order.paymentMethod as PaymentProvider);

    // Extract address details
    const shippingAddr = (order.shippingAddressSnapshot as Record<string, unknown> | null) || {};

    try {
      const initResult = await gateway.initialize({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount,
        currency,
        transactionId,
        customer: {
          id: order.customer?.id,
          name: order.customer?.name || (typeof customerSnapshot?.name === 'string' ? customerSnapshot.name : 'Valued Customer'),
          email: order.customer?.email || (typeof customerSnapshot?.email === 'string' ? customerSnapshot.email : 'customer@example.com'),
          phone: order.customer?.phone || (typeof customerSnapshot?.phone === 'string' ? customerSnapshot.phone : '01700000000'),
        },
        shippingAddress: {
          address1: (shippingAddr.address1 as string) || (shippingAddr.street as string) || 'Dhaka',
          city: (shippingAddr.city as string) || 'Dhaka',
          postalCode: (shippingAddr.postalCode as string) || '1000',
          country: (shippingAddr.country as string) || 'Bangladesh',
        },
      });

      // Update payment record to PENDING with sessionKey
      await this.repo.updatePayment(payment.id, {
        status: 'PENDING',
        providerReference: initResult.sessionKey || initResult.providerReference,
      });

      return {
        paymentId: payment.id,
        transactionId,
        gatewayUrl: initResult.gatewayUrl,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.updatePayment(payment.id, {
        status: 'FAILED',
        failureReason: message,
      });
      throw err;
    }
  }

  /**
   * Handles SSLCOMMERZ browser redirect callbacks (success, fail, cancel).
   * ZERO TRUST:
   * Even if status is 'VALID', server calls Order Validation API to verify authenticity.
   */
  async handleSslCallback(
    action: 'success' | 'fail' | 'cancel',
    payload: Record<string, unknown>,
  ): Promise<{ redirectUrl: string }> {
    const frontendBaseUrl = env.FRONTEND_URL || 'http://localhost:3000';
    const transactionId = typeof payload.tran_id === 'string' ? payload.tran_id : '';

    if (!transactionId) {
      return {
        redirectUrl: `${frontendBaseUrl}/payment/result?status=failed&reason=missing_transaction_id`,
      };
    }

    const payment = await this.repo.findByTransactionId('SSLCOMMERZ', transactionId);
    if (!payment) {
      logger.warn({ transactionId }, 'SSLCOMMERZ callback received for unknown transaction');
      return {
        redirectUrl: `${frontendBaseUrl}/payment/result?status=failed&reason=unknown_transaction`,
      };
    }

    // 1. Idempotency: If payment is already PAID, safely redirect to success
    if (payment.status === 'PAID') {
      return {
        redirectUrl: `${frontendBaseUrl}/payment/result?orderId=${payment.orderId}&status=success&tranId=${transactionId}`,
      };
    }

    const gateway = this.registry.getGateway('SSLCOMMERZ');

    // 2. Handle cancellation or failure callback
    if (action === 'cancel' || action === 'fail') {
      const targetStatus = action === 'cancel' ? 'CANCELLED' : 'FAILED';
      const reason =
        (typeof payload.error === 'string' ? payload.error : undefined) ||
        (action === 'cancel' ? 'Customer cancelled payment' : 'Payment failed at gateway');

      await this.repo.markPaymentFailedInTransaction({
        paymentId: payment.id,
        status: targetStatus,
        reason,
        eventId:
          (typeof payload.val_id === 'string' ? payload.val_id : undefined) ||
          `EVENT-${transactionId}-${action}`,
        eventType: `SSLCOMMERZ_${action.toUpperCase()}`,
        rawPayload: payload,
      });

      return {
        redirectUrl: `${frontendBaseUrl}/payment/result?orderId=${payment.orderId}&status=${action}&tranId=${transactionId}`,
      };
    }

    // 3. Handle success callback: MUST execute server-side Order Validation API check
    const valId = typeof payload.val_id === 'string' ? payload.val_id : '';
    if (!valId) {
      await this.repo.markPaymentFailedInTransaction({
        paymentId: payment.id,
        status: 'FAILED',
        reason: 'Missing val_id in success callback',
        eventId: `EVENT-${transactionId}-NO-VALID`,
        eventType: 'SSLCOMMERZ_SUCCESS_WITHOUT_VALID',
        rawPayload: payload,
      });

      return {
        redirectUrl: `${frontendBaseUrl}/payment/result?orderId=${payment.orderId}&status=failed&reason=missing_val_id`,
      };
    }

    const verifyResult = await gateway.verify({
      valId,
      transactionId,
      amount: Number(payment.amount),
      currency: payment.currency,
    });

    // Verification integrity checks
    const isStatusValid = verifyResult.isValid && (verifyResult.status === 'VALID');
    const isAmountValid = Math.abs(Number(verifyResult.amount) - Number(payment.amount)) < 0.01;
    const isCurrencyValid = verifyResult.currency.toUpperCase() === 'BDT';
    const isTranIdValid = verifyResult.transactionId === transactionId;

    if (!isStatusValid || !isAmountValid || !isCurrencyValid || !isTranIdValid) {
      const securityReason = `Verification mismatch: valid=${isStatusValid}, amt=${isAmountValid}, cur=${isCurrencyValid}, tran=${isTranIdValid}`;
      logger.error({ transactionId, verifyResult, securityReason }, 'SSLCOMMERZ payment verification failed');

      await this.repo.markPaymentFailedInTransaction({
        paymentId: payment.id,
        status: 'FAILED',
        reason: securityReason,
        eventId: valId,
        eventType: 'SSLCOMMERZ_VERIFICATION_MISMATCH',
        rawPayload: payload,
      });

      return {
        redirectUrl: `${frontendBaseUrl}/payment/result?orderId=${payment.orderId}&status=failed&reason=verification_mismatch`,
      };
    }

    // 4. Atomic PAID transition
    await this.repo.markPaymentPaidInTransaction({
      paymentId: payment.id,
      bankTranId: verifyResult.bankTranId,
      cardType: verifyResult.cardType,
      eventId: valId,
      eventType: 'SSLCOMMERZ_CALLBACK_SUCCESS',
      rawPayload: payload,
    });

    return {
      redirectUrl: `${frontendBaseUrl}/payment/result?orderId=${payment.orderId}&status=success&tranId=${transactionId}`,
    };
  }

  /**
   * Handles SSLCOMMERZ Instant Payment Notification (IPN).
   * 1. Cryptographic MD5 hash verification.
   * 2. Replay prevention via unique (provider, eventId).
   * 3. Server-to-server Order Validation API double-check.
   * 4. Atomic PAID transition with stock commit and order confirmation.
   */
  async handleSslIpn(payload: Record<string, unknown>): Promise<{ status: string; processed: boolean }> {
    const gateway = this.registry.getGateway('SSLCOMMERZ');

    // 1. Authenticity check: MD5 hash verification of verify_sign
    const ipnResult = await gateway.handleIpn(payload);
    if (!ipnResult.isAuthentic) {
      logger.warn({ payload: payload.tran_id }, 'Invalid IPN signature rejected');
      throw AppError.badRequest('Invalid IPN signature hash');
    }

    const transactionId = typeof payload.tran_id === 'string' ? payload.tran_id : '';
    const eventId =
      (typeof payload.val_id === 'string' ? payload.val_id : undefined) ||
      transactionId ||
      `EVENT-${Date.now()}`;

    const payment = await this.repo.findByTransactionId('SSLCOMMERZ', transactionId);
    if (!payment) {
      logger.warn({ transactionId }, 'IPN received for unknown transaction');
      return { status: 'unknown_transaction', processed: false };
    }

    // 2. Duplicate / Replay protection: Check if event is already recorded
    if (payment.status === 'PAID') {
      const eventRes = await this.repo.recordPaymentEvent({
        paymentId: payment.id,
        provider: 'SSLCOMMERZ',
        eventId,
        eventType: 'SSLCOMMERZ_IPN_DUPLICATE',
        rawPayload: payload,
        signatureValid: true,
      });

      return { status: 'already_paid_noop', processed: !eventRes.isDuplicate };
    }

    // 3. Double-check with Order Validation API
    const valId = typeof payload.val_id === 'string' ? payload.val_id : '';
    if (!valId) {
      throw AppError.badRequest('Missing val_id in IPN payload');
    }

    const verifyResult = await gateway.verify({
      valId,
      transactionId,
      amount: Number(payment.amount),
      currency: payment.currency,
    });

    const isStatusValid = verifyResult.isValid && verifyResult.status === 'VALID';
    const isAmountValid = Math.abs(Number(verifyResult.amount) - Number(payment.amount)) < 0.01;
    const isCurrencyValid = verifyResult.currency.toUpperCase() === 'BDT';

    if (!isStatusValid || !isAmountValid || !isCurrencyValid) {
      await this.repo.markPaymentFailedInTransaction({
        paymentId: payment.id,
        status: 'FAILED',
        reason: 'IPN Order Validation API mismatch',
        eventId,
        eventType: 'SSLCOMMERZ_IPN_MISMATCH',
        rawPayload: payload,
      });

      return { status: 'validation_mismatch', processed: false };
    }

    // 4. Atomic PAID transition
    await this.repo.markPaymentPaidInTransaction({
      paymentId: payment.id,
      bankTranId: verifyResult.bankTranId,
      cardType: verifyResult.cardType,
      eventId,
      eventType: 'SSLCOMMERZ_IPN_PAID',
      rawPayload: payload,
    });

    return { status: 'processed', processed: true };
  }

  /**
   * Retrieves payment status for an order.
   * Accessible by order owner or guest with valid guestToken.
   */
  async getPaymentStatus(
    orderId: string,
    actorContext: { userId?: string; guestToken?: string },
  ): Promise<{ orderId: string; orderStatus: string; paymentStatus: string; payments: PaymentEntity[] }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true } },
      },
    });

    if (!order) {
      throw AppError.notFound('Order not found');
    }

    const custSnapshot = order.customerSnapshot as Record<string, unknown> | null;
    const isOwner = actorContext.userId && order.customerId === actorContext.userId;
    const isGuestOwner =
      actorContext.guestToken &&
      custSnapshot?.guestToken === actorContext.guestToken;

    if (!isOwner && !isGuestOwner) {
      throw AppError.forbidden('You do not have permission to view payment status for this order');
    }

    const payments = await this.repo.findAllByOrderId(order.id);

    return {
      orderId: order.id,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      payments,
    };
  }

  /**
   * Admin endpoint: Marks Cash on Delivery (COD) payment as collected.
   * Condition: Order must be DELIVERED.
   */
  async markCodCollected(paymentId: string, actorId: string, _note?: string): Promise<PaymentEntity> {
    const payment = await this.repo.findById(paymentId);
    if (!payment) {
      throw AppError.notFound('Payment not found');
    }

    if (payment.provider !== 'COD') {
      throw AppError.badRequest('Only COD payments can be marked as collected via this endpoint');
    }

    if (payment.status === 'PAID') {
      return payment;
    }

    const order = payment.order;
    if (!order) {
      throw AppError.notFound('Associated order not found for payment');
    }

    if (order.status !== 'DELIVERED') {
      throw AppError.badRequest(
        `COD payment can only be collected after the order is DELIVERED (current status: '${order.status}')`,
      );
    }

    assertValidPaymentTransition(payment.status, 'PAID');

    const updated = await prisma.$transaction(async tx => {
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          changedById: actorId,
          note: 'COD payment collected upon delivery',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          actorType: 'USER',
          action: 'COD_PAYMENT_COLLECTED',
          targetType: 'PAYMENT',
          targetId: payment.id,
          metadata: {
            orderId: order.id,
            amount: Number(payment.amount),
          },
        },
      });

      return updatedPayment;
    });

    return updated as unknown as PaymentEntity;
  }

  /**
   * Admin endpoint: Initiates full or partial refund.
   * Enforces permissions, idempotency, and checks gateway refund limits.
   */
  async refundPayment(
    paymentId: string,
    dto: RefundPaymentDto,
    actorId: string,
  ): Promise<RefundEntity> {
    const payment = await this.repo.findById(paymentId);
    if (!payment) {
      throw AppError.notFound('Payment not found');
    }

    if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw AppError.badRequest(`Cannot refund payment in '${payment.status}' status`);
    }

    // Check existing refunds
    const existingRefunds = payment.refunds || [];
    const totalRefunded = existingRefunds
      .filter(r => r.status === 'COMPLETED')
      .reduce((acc, r) => acc + Number(r.amount), 0);

    const paymentAmount = Number(payment.amount);
    const refundableAmount = paymentAmount - totalRefunded;

    if (dto.amount > refundableAmount) {
      throw AppError.badRequest(
        `Requested refund amount (${dto.amount} BDT) exceeds refundable balance (${refundableAmount.toFixed(2)} BDT)`,
      );
    }

    // Check idempotencyKey if provided
    if (dto.idempotencyKey) {
      const existing = await prisma.refund.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return existing as unknown as RefundEntity;
      }
    }

    let providerRefundId: string | undefined;

    // Process gateway refund for online providers
    if (payment.provider === 'SSLCOMMERZ') {
      if (!payment.bankTranId) {
        throw AppError.badRequest('Missing bankTranId on payment required for SSLCOMMERZ refund');
      }

      const gateway = this.registry.getGateway('SSLCOMMERZ');
      const refundRefId = dto.idempotencyKey || `REF-${Date.now()}`;

      const refundResult = await gateway.initiateRefund({
        paymentId: payment.id,
        bankTranId: payment.bankTranId,
        amount: dto.amount,
        reason: dto.reason,
        refundRefId,
      });

      if (!refundResult.success) {
        throw AppError.badGateway(
          `SSLCOMMERZ refund rejected: ${refundResult.errorMessage || 'Unknown error'}`,
        );
      }

      providerRefundId = refundResult.providerRefundId;
    } else if (payment.provider === 'COD') {
      // Manual cash refund
      providerRefundId = `COD-MANUAL-${Date.now()}`;
    }

    // Record refund in DB
    const newTotalRefunded = totalRefunded + dto.amount;
    const isFullyRefunded = Math.abs(newTotalRefunded - paymentAmount) < 0.01;
    const newPaymentStatus = isFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const refund = await prisma.$transaction(async tx => {
      const createdRefund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId: payment.orderId,
          amount: dto.amount,
          reason: dto.reason,
          status: 'COMPLETED',
          processedById: actorId,
          providerRefundId,
          idempotencyKey: dto.idempotencyKey,
          processedAt: new Date(),
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newPaymentStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          actorType: 'USER',
          action: 'PAYMENT_REFUNDED',
          targetType: 'REFUND',
          targetId: createdRefund.id,
          metadata: {
            paymentId: payment.id,
            amount: dto.amount,
            isFullyRefunded,
            reason: dto.reason,
          },
        },
      });

      return createdRefund;
    });

    return refund as unknown as RefundEntity;
  }

  /**
   * Reconciles orphan pending payments with gateway query APIs.
   */
  async reconcilePendingPayments(olderThanMs = 15 * 60 * 1000): Promise<{ reconciled: number; failed: number }> {
    const pendingPayments = await this.repo.findPendingPaymentsForReconciliation(olderThanMs);
    let reconciled = 0;
    let failed = 0;

    for (const payment of pendingPayments) {
      if (payment.provider === 'SSLCOMMERZ' && payment.transactionId) {
        try {
          const gateway = this.registry.getGateway('SSLCOMMERZ');
          const queryResult = await gateway.queryTransaction(payment.transactionId);

          if (queryResult.status === 'PAID') {
            await this.repo.markPaymentPaidInTransaction({
              paymentId: payment.id,
              bankTranId: queryResult.bankTranId,
              eventId: `RECON-${payment.transactionId}`,
              eventType: 'RECONCILIATION_SYNC_PAID',
              rawPayload: queryResult.rawResponse || {},
              actorContext: { actorType: 'SYSTEM' },
            });
            reconciled++;
          } else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(queryResult.status)) {
            await this.repo.markPaymentFailedInTransaction({
              paymentId: payment.id,
              status: queryResult.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
              reason: 'Reconciliation detected terminal failure',
              eventId: `RECON-${payment.transactionId}`,
              eventType: 'RECONCILIATION_SYNC_FAILED',
              rawPayload: queryResult.rawResponse || {},
              actorContext: { actorType: 'SYSTEM' },
            });
            reconciled++;
          }
        } catch (err) {
          logger.warn({ paymentId: payment.id, error: err }, 'Reconciliation attempt failed for payment');
          failed++;
        }
      }
    }

    return { reconciled, failed };
  }

  /**
   * Admin: List payments with pagination and filters.
   */
  async listPayments(query: ListPaymentsQuery): Promise<{ payments: PaymentEntity[]; total: number }> {
    return await this.repo.findPayments(query);
  }

  /**
   * Admin: Get payment by ID with timeline events and refunds.
   */
  async getPaymentById(id: string): Promise<PaymentEntity> {
    const payment = await this.repo.findById(id);
    if (!payment) {
      throw AppError.notFound('Payment not found');
    }
    return payment;
  }

  /**
   * Automatically cancels unpaid orders exceeding payment deadline.
   * Idempotently releases reserved stock and logs state transition.
   */
  async cancelExpiredUnpaidOrders(now: Date = new Date()): Promise<number> {
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: 'PENDING',
        paymentStatus: { in: ['PENDING', 'INITIATED', 'FAILED'] },
        OR: [
          { paymentDeadline: { lte: now } },
          {
            paymentDeadline: null,
            placedAt: {
              lte: new Date(now.getTime() - env.ORDER_PAYMENT_TIMEOUT_HOURS * 60 * 60 * 1000),
            },
          },
        ],
      },
      include: { items: true },
    });

    let cancelledCount = 0;

    for (const order of expiredOrders) {
      try {
        await prisma.$transaction(async tx => {
          // Re-verify order status inside transaction
          const currentOrder = await tx.order.findUnique({
            where: { id: order.id },
            include: { items: true },
          });

          if (!currentOrder || currentOrder.status !== 'PENDING' || currentOrder.paymentStatus === 'PAID') {
            return;
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: now,
              cancellationReason: 'Payment deadline expired',
            },
          });

          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              status: 'CANCELLED',
              note: 'Payment deadline expired; auto-cancelled',
            },
          });

          const defaultWarehouse = await tx.warehouse.findFirst({
            where: { isDefault: true, isActive: true },
          });
          const warehouseId = defaultWarehouse?.id || 'WH-DHK-01';

          for (const item of currentOrder.items) {
            if (item.variantId) {
              await inventoryService.releaseReservation(
                {
                  variantId: item.variantId,
                  warehouseId,
                  quantity: item.quantity,
                  referenceType: 'ORDER',
                  referenceId: currentOrder.orderNumber,
                  reason: `Stock released due to payment deadline expiration (${currentOrder.orderNumber})`,
                },
                tx,
              );
            }
          }

          await tx.auditLog.create({
            data: {
              actorType: 'SYSTEM',
              action: 'ORDER_AUTO_CANCELLED_UNPAID',
              targetType: 'ORDER',
              targetId: currentOrder.id,
              metadata: {
                orderNumber: currentOrder.orderNumber,
                reason: 'Payment deadline expired',
                cancelledAt: now.toISOString(),
              },
            },
          });
        });
        cancelledCount++;
      } catch (err: unknown) {
        logger.error({ orderId: order.id, err }, 'Failed to cancel expired unpaid order');
      }
    }

    return cancelledCount;
  }
}

export const paymentsService = new PaymentsService();
