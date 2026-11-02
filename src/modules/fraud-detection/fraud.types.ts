import type { FraudRiskLevel, FraudReviewStatus } from '@prisma/client';

export type { FraudRiskLevel, FraudReviewStatus };

export interface FraudRuleFacts {
  orderId: string;
  orderNumber: string;
  customerId?: string | null;
  phone: string;
  email?: string | null;
  grandTotal: number;
  paymentMethod: string;
  itemCount: number;
  maxItemPrice: number;
  shippingAddress: {
    address: string;
    district: string;
    area: string;
  };
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceCategory?: string | null;
  customerCreatedAt?: Date | null;
  isGuest: boolean;
  history?: {
    cancelledCodCount?: number;
    ordersSamePhoneShortWindow?: number;
    orderFrequency24h?: number;
    failedPaymentAttempts24h?: number;
    previousConfirmedFraud?: boolean;
    distinctAccountsSharingAddress?: number;
  };
}

export interface RuleEvaluationResult {
  triggered: boolean;
  points: number;
  reason: string;
}

export type RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
) => RuleEvaluationResult;

export interface RiskScoreResult {
  score: number;
  factors: Record<string, unknown>;
  explanation: string;
}

export interface RiskScorer {
  name: string;
  score(facts: FraudRuleFacts): Promise<RiskScoreResult> | RiskScoreResult;
}

export interface TriggeredRuleItem {
  key: string;
  name: string;
  points: number;
  reason: string;
}

export interface FraudAssessmentResult {
  riskScore: number;
  riskLevel: FraudRiskLevel;
  triggeredRules: TriggeredRuleItem[];
  factors: Record<string, unknown>;
  explanation: string;
  reviewStatus: FraudReviewStatus;
  rulesVersion: string;
}

export interface FraudReviewFilter {
  status?: FraudReviewStatus;
  riskLevel?: FraudRiskLevel;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

export interface FraudStats {
  totalAssessments: number;
  lowRiskCount: number;
  mediumRiskCount: number;
  highRiskCount: number;
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  falsePositiveCount: number;
  falsePositiveRate: number;
}

export interface UpdateFraudRuleInput {
  name?: string;
  description?: string;
  weight?: number;
  isEnabled?: boolean;
  parameters?: Record<string, unknown>;
}
