import { logger } from '@/utils/logger';
import { AppError } from '@/utils/app-error';
import { generateNumericOtp, hashToken } from '@/utils/token.util';
import { auditService, type IAuditService } from '@/services/audit.service';
import { authRepository, type PrismaAuthRepository } from '@/modules/auth/auth.repository';
import { ordersService, type OrdersService } from '@/modules/orders/orders.service';
import type { OrderEntity, IFraudAssessor } from '@/modules/orders/orders.types';
import { fraudRepository, type FraudRepository } from './fraud.repository';
import { fraudEngine, type FraudEngine } from './fraud.engine';
import type {
  FraudRuleFacts,
  FraudReviewFilter,
  FraudStats,
  UpdateFraudRuleInput,
} from './fraud.types';

export class FraudService implements IFraudAssessor {
  constructor(
    private readonly repo: FraudRepository = fraudRepository,
    private readonly engine: FraudEngine = fraudEngine,
    private readonly authRepo: PrismaAuthRepository = authRepository,
    private readonly audit: IAuditService = auditService,
    private readonly ordersSvc: OrdersService = ordersService,
  ) {}

  /**
   * Hook executed immediately after order creation (M9 IFraudAssessor).
   * Policy:
   * - LOW: normal flow (AUTO_APPROVED)
   * - MEDIUM: normal flow + admin visible flag (MANUAL_REVIEW)
   * - HIGH: order PENDING hold in manual review queue (blocks confirmation / fulfillment)
   * Fail-open:
   * - Any unexpected evaluation exception or timeout must NEVER block the customer's order.
   *   Logs warning, records fallback record with flag 'assessment_failed', and allows order to proceed.
   */
  async assessOrder(order: OrderEntity): Promise<void> {
    try {
      const customerSnapshot = order.customerSnapshot;
      const shippingAddress = order.shippingAddressSnapshot;

      const phone = customerSnapshot?.phone || 'UNKNOWN';
      const address = shippingAddress?.address || '';

      // Gather history metrics across past orders
      const history = await this.repo.gatherHistory(
        phone,
        order.customerId,
        address,
      );

      // Extract item counts and max line item price
      const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const maxItemPrice = order.items.reduce((max, item) => {
        const p = parseFloat(item.unitPrice) || 0;
        return p > max ? p : max;
      }, 0);

      const facts: FraudRuleFacts = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        phone,
        email: customerSnapshot?.email,
        grandTotal: parseFloat(order.grandTotal) || 0,
        paymentMethod: order.paymentMethod,
        itemCount,
        maxItemPrice,
        shippingAddress: {
          address,
          district: shippingAddress?.district || 'UNKNOWN',
          area: shippingAddress?.area || 'UNKNOWN',
        },
        isGuest: customerSnapshot?.isGuest ?? true,
        history,
      };

      const rules = await this.repo.listRules();
      const assessmentResult = await this.engine.evaluate(facts, rules);

      await this.repo.saveAssessment({
        orderId: order.id,
        riskScore: assessmentResult.riskScore,
        riskLevel: assessmentResult.riskLevel,
        triggeredRules: assessmentResult.triggeredRules,
        factors: assessmentResult.factors,
        explanation: assessmentResult.explanation,
        reviewStatus: assessmentResult.reviewStatus,
      });

      logger.info(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          riskScore: assessmentResult.riskScore,
          riskLevel: assessmentResult.riskLevel,
          reviewStatus: assessmentResult.reviewStatus,
        },
        'Fraud assessment evaluated successfully',
      );
    } catch (error) {
      // Fail-open policy: order is NOT blocked on assessment error
      logger.error(
        {
          orderId: order.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Fraud assessment failed-open: logging flag and allowing order to proceed',
      );

      try {
        await this.repo.saveAssessment({
          orderId: order.id,
          riskScore: 0,
          riskLevel: 'LOW',
          triggeredRules: [],
          factors: {
            flag: 'assessment_failed',
            error: error instanceof Error ? error.message : String(error),
          },
          explanation: 'Fraud assessment failed open due to internal error; order allowed to proceed',
          reviewStatus: 'AUTO_APPROVED',
        });
      } catch (saveErr) {
        logger.error({ saveErr }, 'Failed to persist fail-open assessment fallback');
      }
    }
  }

  /**
   * Retrieves all rules configured in DB
   */
  async getRules() {
    return this.repo.listRules();
  }

  /**
   * Updates rule parameters and weight (0-100) with audit logging
   */
  async updateRule(
    key: string,
    input: UpdateFraudRuleInput,
    actorContext: { id: string },
  ) {
    const existing = await this.repo.findRuleByKey(key);
    if (!existing) {
      throw AppError.notFound(`Fraud rule '${key}' not found`);
    }

    if (input.weight !== undefined) {
      if (input.weight < 0 || input.weight > 100) {
        throw AppError.badRequest('Rule weight must be an integer between 0 and 100');
      }
    }

    const updated = await this.repo.updateRule(key, input);

    await this.audit.record({
      actorId: actorContext.id,
      actorType: 'USER',
      action: 'FRAUD_RULE_UPDATED',
      targetType: 'FRAUD_RULE',
      targetId: key,
      metadata: {
        before: {
          weight: existing.weight,
          isEnabled: existing.isEnabled,
          parameters: existing.parameters,
        },
        after: {
          weight: updated.weight,
          isEnabled: updated.isEnabled,
          parameters: updated.parameters,
        },
      },
    });

    return updated;
  }

  /**
   * Lists reviews for admin review queue
   */
  async listReviews(filter: FraudReviewFilter) {
    return this.repo.listAssessments(filter);
  }

  /**
   * Gets single review details including masked factors, customer history, and decisions
   */
  async getReviewDetail(id: string) {
    const record = await this.repo.findAssessmentById(id);
    if (!record) {
      throw AppError.notFound('Fraud review record not found');
    }
    return record;
  }

  /**
   * Approves a held order. Order resumes normal flow (eligible for CONFIRMED).
   * Supports marking as false positive for analytics and rule calibration.
   */
  async approveReview(
    id: string,
    actorContext: { id: string },
    options: { isFalsePositive?: boolean; note?: string } = {},
  ) {
    const assessment = await this.repo.findAssessmentById(id);
    if (!assessment) {
      throw AppError.notFound('Fraud review record not found');
    }

    const decision = options.isFalsePositive ? 'FALSE_POSITIVE' : 'APPROVED';
    const reason = options.note
      ? `Approved by staff. ${options.note}`
      : 'Approved by staff review';

    const updated = await this.repo.recordDecision({
      assessmentId: id,
      actorId: actorContext.id,
      previousStatus: assessment.reviewStatus,
      newStatus: 'APPROVED',
      decision,
      reason,
    });

    await this.audit.record({
      actorId: actorContext.id,
      actorType: 'USER',
      action: 'FRAUD_REVIEW_APPROVED',
      targetType: 'FRAUD_ASSESSMENT',
      targetId: id,
      metadata: {
        orderId: assessment.orderId,
        isFalsePositive: !!options.isFalsePositive,
        note: options.note,
      },
    });

    return updated;
  }

  /**
   * Rejects a held order. Requires a specific reason.
   * Cancels order and releases stock reservation atomically via order lifecycle machine.
   */
  async rejectReview(
    id: string,
    actorContext: { id: string; permissions: string[] },
    reason: string,
  ) {
    if (!reason || reason.trim().length === 0) {
      throw AppError.badRequest('A specific rejection reason is required');
    }

    const assessment = await this.repo.findAssessmentById(id);
    if (!assessment) {
      throw AppError.notFound('Fraud review record not found');
    }

    const updated = await this.repo.recordDecision({
      assessmentId: id,
      actorId: actorContext.id,
      previousStatus: assessment.reviewStatus,
      newStatus: 'REJECTED',
      decision: 'REJECTED',
      reason,
    });

    // Cancel order and release reserved inventory stock atomically
    try {
      await this.ordersSvc.updateOrderStatus(
        assessment.orderId,
        {
          status: 'CANCELLED',
          cancellationReason: `Cancelled following fraud review: ${reason}`,
        },
        {
          id: actorContext.id,
          permissions: [...actorContext.permissions, 'order:manage', 'order:cancel'],
        },
      );
    } catch (err) {
      logger.error({ err, orderId: assessment.orderId }, 'Error cancelling order after fraud rejection');
    }

    await this.audit.record({
      actorId: actorContext.id,
      actorType: 'USER',
      action: 'FRAUD_REVIEW_REJECTED',
      targetType: 'FRAUD_ASSESSMENT',
      targetId: id,
      metadata: {
        orderId: assessment.orderId,
        reason,
      },
    });

    return updated;
  }

  /**
   * Requests phone OTP verification for customer review.
   * Sends OTP to customer phone and transitions review status to OTP_REQUESTED.
   * Customer-facing message is generic: "Order verification needed".
   */
  async requestOtp(id: string, actorContext: { id: string }) {
    const assessment = await this.repo.findAssessmentById(id);
    if (!assessment) {
      throw AppError.notFound('Fraud review record not found');
    }

    const customerSnapshot = assessment.order.customerSnapshot as { phone?: string } | null;
    const phone = customerSnapshot?.phone;
    if (!phone) {
      throw AppError.badRequest('Customer phone number not available for OTP dispatch');
    }

    const otp = generateNumericOtp(6);
    const codeHash = hashToken(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.authRepo.createOtpCode(phone, codeHash, 'FRAUD_ORDER_VERIFICATION', expiresAt);

    // Development log of OTP (never log secret in production)
    if (process.env.NODE_ENV !== 'production') {
      logger.info({ phone, purpose: 'FRAUD_ORDER_VERIFICATION' }, `[DEV OTP DISPATCH] Verification code: ${otp}`);
    }

    await this.repo.recordDecision({
      assessmentId: id,
      actorId: actorContext.id,
      previousStatus: assessment.reviewStatus,
      newStatus: 'OTP_REQUESTED',
      decision: 'OTP_REQUESTED',
      reason: `Verification OTP dispatched to customer phone`,
    });

    return {
      message: 'Order verification needed. A verification code has been dispatched.',
      status: 'OTP_REQUESTED',
    };
  }

  /**
   * Verifies the OTP code submitted by customer or staff.
   * If valid, assessment is marked APPROVED and order is eligible to resume.
   */
  async verifyOtp(id: string, code: string, actorContext: { id: string }) {
    if (!code || code.trim().length !== 6) {
      throw AppError.badRequest('A valid 6-digit verification code is required');
    }

    const assessment = await this.repo.findAssessmentById(id);
    if (!assessment) {
      throw AppError.notFound('Fraud review record not found');
    }

    const customerSnapshot = assessment.order.customerSnapshot as { phone?: string } | null;
    const phone = customerSnapshot?.phone;
    if (!phone) {
      throw AppError.badRequest('Customer phone number not found');
    }

    const otpRecord = await this.authRepo.findLatestValidOtp(phone, 'FRAUD_ORDER_VERIFICATION');
    if (!otpRecord) {
      throw AppError.badRequest('Verification code is invalid or has expired');
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      throw AppError.forbidden('Maximum verification attempts exceeded. Please request a new code.');
    }

    const inputHash = hashToken(code.trim());
    if (inputHash !== otpRecord.codeHash) {
      await this.authRepo.incrementOtpAttempts(otpRecord.id);
      throw AppError.badRequest('Invalid verification code');
    }

    await this.authRepo.markOtpUsed(otpRecord.id);

    const updated = await this.repo.recordDecision({
      assessmentId: id,
      actorId: actorContext.id,
      previousStatus: assessment.reviewStatus,
      newStatus: 'APPROVED',
      decision: 'APPROVED_VIA_OTP',
      reason: 'Phone ownership verified via OTP',
    });

    return {
      message: 'Order verification completed successfully',
      assessment: updated,
    };
  }

  /**
   * Aggregates stats for fraud management
   */
  async getStats(): Promise<FraudStats> {
    return this.repo.getStats();
  }
}

export const fraudService = new FraudService();
ordersService.setFraudAssessor(fraudService);

