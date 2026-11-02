import { prisma } from '@/config/database';
import type { Prisma } from '@prisma/client';
import type {
  FraudRuleFacts,
  FraudReviewFilter,
  FraudStats,
  UpdateFraudRuleInput,
} from './fraud.types';
import type { StoredFraudRule } from './fraud.engine';

export class FraudRepository {
  /**
   * Retrieves all registered fraud rules
   */
  async listRules(): Promise<StoredFraudRule[]> {
    return prisma.fraudRule.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Finds a single fraud rule by unique key
   */
  async findRuleByKey(key: string) {
    return prisma.fraudRule.findUnique({
      where: { key },
    });
  }

  /**
   * Updates a rule configuration
   */
  async updateRule(key: string, data: UpdateFraudRuleInput) {
    return prisma.fraudRule.update({
      where: { key },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.weight !== undefined && { weight: data.weight }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        ...(data.parameters !== undefined && {
          parameters: data.parameters as Prisma.InputJsonValue,
        }),
      },
    });
  }

  /**
   * Upserts a fraud assessment for an order
   */
  async saveAssessment(input: {
    orderId: string;
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    triggeredRules: unknown;
    factors: unknown;
    explanation?: string;
    reviewStatus: 'PENDING' | 'AUTO_APPROVED' | 'MANUAL_REVIEW' | 'APPROVED' | 'REJECTED' | 'OTP_REQUESTED';
  }) {
    return prisma.fraudAssessment.upsert({
      where: { orderId: input.orderId },
      update: {
        riskScore: input.riskScore,
        riskLevel: input.riskLevel,
        triggeredRules: input.triggeredRules as Prisma.InputJsonValue,
        factors: input.factors as Prisma.InputJsonValue,
        explanation: input.explanation,
        reviewStatus: input.reviewStatus,
      },
      create: {
        orderId: input.orderId,
        riskScore: input.riskScore,
        riskLevel: input.riskLevel,
        triggeredRules: input.triggeredRules as Prisma.InputJsonValue,
        factors: input.factors as Prisma.InputJsonValue,
        explanation: input.explanation,
        reviewStatus: input.reviewStatus,
      },
    });
  }

  /**
   * Finds an assessment by orderId
   */
  async findAssessmentByOrderId(orderId: string) {
    return prisma.fraudAssessment.findUnique({
      where: { orderId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            grandTotal: true,
            paymentStatus: true,
            paymentMethod: true,
            customerSnapshot: true,
            shippingAddressSnapshot: true,
          },
        },
        decisionHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Finds an assessment by assessment id
   */
  async findAssessmentById(id: string) {
    return prisma.fraudAssessment.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerId: true,
            status: true,
            grandTotal: true,
            paymentStatus: true,
            paymentMethod: true,
            customerSnapshot: true,
            shippingAddressSnapshot: true,
          },
        },
        decisionHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Lists reviews for the review queue with pagination
   */
  async listAssessments(filter: FraudReviewFilter) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.FraudAssessmentWhereInput = {};

    if (filter.status) {
      where.reviewStatus = filter.status;
    }
    if (filter.riskLevel) {
      where.riskLevel = filter.riskLevel;
    }
    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {
        ...(filter.dateFrom && { gte: filter.dateFrom }),
        ...(filter.dateTo && { lte: filter.dateTo }),
      };
    }

    const [items, total] = await Promise.all([
      prisma.fraudAssessment.findMany({
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
              paymentMethod: true,
              status: true,
              placedAt: true,
            },
          },
        },
      }),
      prisma.fraudAssessment.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Updates review decision and appends to decision history atomically
   */
  async recordDecision(input: {
    assessmentId: string;
    actorId: string;
    previousStatus: 'PENDING' | 'AUTO_APPROVED' | 'MANUAL_REVIEW' | 'APPROVED' | 'REJECTED' | 'OTP_REQUESTED';
    newStatus: 'PENDING' | 'AUTO_APPROVED' | 'MANUAL_REVIEW' | 'APPROVED' | 'REJECTED' | 'OTP_REQUESTED';
    decision: string;
    reason: string;
  }) {
    return prisma.$transaction(async tx => {
      const updated = await tx.fraudAssessment.update({
        where: { id: input.assessmentId },
        data: {
          reviewStatus: input.newStatus,
          decision: input.decision,
          decidedById: input.actorId,
          decidedAt: new Date(),
        },
      });

      await tx.fraudDecisionHistory.create({
        data: {
          fraudAssessmentId: input.assessmentId,
          actorId: input.actorId,
          previousStatus: input.previousStatus,
          newStatus: input.newStatus,
          reason: input.reason,
        },
      });

      return updated;
    });
  }

  /**
   * Aggregates stats for fraud management
   */
  async getStats(): Promise<FraudStats> {
    const [
      totalAssessments,
      lowRiskCount,
      mediumRiskCount,
      highRiskCount,
      pendingReviewCount,
      approvedCount,
      rejectedCount,
      falsePositiveCount,
    ] = await Promise.all([
      prisma.fraudAssessment.count(),
      prisma.fraudAssessment.count({ where: { riskLevel: 'LOW' } }),
      prisma.fraudAssessment.count({ where: { riskLevel: 'MEDIUM' } }),
      prisma.fraudAssessment.count({ where: { riskLevel: 'HIGH' } }),
      prisma.fraudAssessment.count({
        where: { reviewStatus: { in: ['PENDING', 'MANUAL_REVIEW', 'OTP_REQUESTED'] } },
      }),
      prisma.fraudAssessment.count({ where: { reviewStatus: 'APPROVED' } }),
      prisma.fraudAssessment.count({ where: { reviewStatus: 'REJECTED' } }),
      prisma.fraudAssessment.count({
        where: {
          decision: 'FALSE_POSITIVE',
        },
      }),
    ]);

    const falsePositiveRate =
      totalAssessments > 0
        ? Number(((falsePositiveCount / totalAssessments) * 100).toFixed(2))
        : 0;

    return {
      totalAssessments,
      lowRiskCount,
      mediumRiskCount,
      highRiskCount,
      pendingReviewCount,
      approvedCount,
      rejectedCount,
      falsePositiveCount,
      falsePositiveRate,
    };
  }

  /**
   * Gathers historical metrics across past orders and users
   */
  async gatherHistory(
    phone: string,
    customerId?: string | null,
    address?: string,
  ): Promise<NonNullable<FraudRuleFacts['history']>> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // 1. Cancelled COD count in last 30 days
    const cancelledCodCount = await prisma.order.count({
      where: {
        paymentMethod: 'COD',
        status: 'CANCELLED',
        placedAt: { gte: thirtyDaysAgo },
        OR: [
          ...(customerId ? [{ customerId }] : []),
          { customerSnapshot: { path: ['phone'], equals: phone } },
        ],
      },
    });

    // 2. Orders with same phone in short window (1 hour)
    const ordersSamePhoneShortWindow = await prisma.order.count({
      where: {
        placedAt: { gte: oneHourAgo },
        customerSnapshot: { path: ['phone'], equals: phone },
      },
    });

    // 3. Order frequency in 24 hours
    const orderFrequency24h = await prisma.order.count({
      where: {
        placedAt: { gte: oneDayAgo },
        OR: [
          ...(customerId ? [{ customerId }] : []),
          { customerSnapshot: { path: ['phone'], equals: phone } },
        ],
      },
    });

    // 4. Failed payment attempts in 24 hours
    const failedPaymentAttempts24h = await prisma.payment.count({
      where: {
        status: 'FAILED',
        createdAt: { gte: oneDayAgo },
        order: {
          OR: [
            ...(customerId ? [{ customerId }] : []),
            { customerSnapshot: { path: ['phone'], equals: phone } },
          ],
        },
      },
    });

    // 5. Previous confirmed fraud (admin decision only)
    const previousFraudRecord = await prisma.fraudAssessment.findFirst({
      where: {
        reviewStatus: 'REJECTED',
        order: {
          OR: [
            ...(customerId ? [{ customerId }] : []),
            { customerSnapshot: { path: ['phone'], equals: phone } },
          ],
        },
      },
      select: { id: true },
    });
    const previousConfirmedFraud = !!previousFraudRecord;

    // 6. Distinct user accounts sharing this address
    let distinctAccountsSharingAddress = 1;
    if (address && address.trim().length > 5) {
      const addressKey = address.trim().toLowerCase();
      const sharedOrders = await prisma.order.findMany({
        where: {
          shippingAddressSnapshot: { path: ['address'], equals: addressKey },
        },
        select: { customerId: true },
        take: 10,
      });

      const uniqueAccounts = new Set(
        sharedOrders.map(o => o.customerId).filter((id): id is string => Boolean(id)),
      );
      if (customerId) uniqueAccounts.add(customerId);
      distinctAccountsSharingAddress = uniqueAccounts.size;
    }

    return {
      cancelledCodCount,
      ordersSamePhoneShortWindow,
      orderFrequency24h,
      failedPaymentAttempts24h,
      previousConfirmedFraud,
      distinctAccountsSharingAddress,
    };
  }
}

export const fraudRepository = new FraudRepository();
