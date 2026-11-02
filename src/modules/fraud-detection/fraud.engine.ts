import crypto from 'crypto';
import type { FraudRiskLevel, FraudReviewStatus } from '@prisma/client';
import type {
  FraudRuleFacts,
  FraudAssessmentResult,
  TriggeredRuleItem,
  RiskScorer,
} from './fraud.types';
import { FRAUD_RULES_REGISTRY } from './fraud.rules';

export interface FraudEngineConfig {
  lowThreshold?: number; // default 30
  highThreshold?: number; // default 70
  rulesVersion?: string;
}

export interface StoredFraudRule {
  key: string;
  name: string;
  weight: number;
  isEnabled: boolean;
  parameters: unknown;
}

export class FraudEngine {
  private readonly lowThreshold: number;
  private readonly highThreshold: number;
  private readonly rulesVersion: string;
  private readonly extensionScorers: RiskScorer[] = [];

  constructor(config: FraudEngineConfig = {}) {
    this.lowThreshold = config.lowThreshold ?? 30;
    this.highThreshold = config.highThreshold ?? 70;
    this.rulesVersion = config.rulesVersion ?? '1.0.0';
  }

  /**
   * Register optional extension scorer (interface RiskScorer)
   */
  registerScorer(scorer: RiskScorer): void {
    this.extensionScorers.push(scorer);
  }

  /**
   * Masks sensitive PII for privacy preservation in audit and factors JSON
   */
  maskFacts(facts: FraudRuleFacts): Record<string, unknown> {
    const phone = facts.phone ? facts.phone.replace(/(\d{3})\d+(\d{4})/, '$1****$2') : 'UNKNOWN';
    const addressHash = facts.shippingAddress?.address
      ? crypto.createHash('sha256').update(facts.shippingAddress.address.trim().toLowerCase()).digest('hex').substring(0, 16)
      : 'UNKNOWN';

    return {
      phoneMasked: phone,
      district: facts.shippingAddress?.district ?? 'UNKNOWN',
      addressFingerprint: addressHash,
      grandTotal: facts.grandTotal,
      paymentMethod: facts.paymentMethod,
      itemCount: facts.itemCount,
      isGuest: facts.isGuest,
      deviceCategory: facts.deviceCategory ?? 'STANDARD',
      historySnapshot: {
        cancelledCodCount: facts.history?.cancelledCodCount ?? 0,
        ordersSamePhoneShortWindow: facts.history?.ordersSamePhoneShortWindow ?? 0,
        orderFrequency24h: facts.history?.orderFrequency24h ?? 0,
        failedPaymentAttempts24h: facts.history?.failedPaymentAttempts24h ?? 0,
        previousConfirmedFraud: facts.history?.previousConfirmedFraud ?? false,
        distinctAccountsSharingAddress: facts.history?.distinctAccountsSharingAddress ?? 0,
      },
    };
  }

  /**
   * Evaluates facts against configured DB rules and calculates total capped risk score
   */
  async evaluate(
    facts: FraudRuleFacts,
    activeRules: StoredFraudRule[],
  ): Promise<FraudAssessmentResult> {
    const triggeredRules: TriggeredRuleItem[] = [];
    let cumulativePoints = 0;

    for (const rule of activeRules) {
      if (!rule.isEnabled) continue;

      const registryEntry = FRAUD_RULES_REGISTRY[rule.key];
      if (!registryEntry) continue;

      const params = (
        typeof rule.parameters === 'object' && rule.parameters !== null
          ? { ...(rule.parameters as Record<string, unknown>), weight: rule.weight }
          : { weight: rule.weight }
      );

      const result = registryEntry.evaluator(facts, params);
      if (result.triggered && result.points > 0) {
        cumulativePoints += result.points;
        triggeredRules.push({
          key: rule.key,
          name: rule.name,
          points: result.points,
          reason: result.reason,
        });
      }
    }

    // Run extension scorers if registered
    for (const scorer of this.extensionScorers) {
      try {
        const scorerResult = await scorer.score(facts);
        if (scorerResult.score > 0) {
          cumulativePoints += scorerResult.score;
          triggeredRules.push({
            key: `EXT_${scorer.name.toUpperCase().replace(/\s+/g, '_')}`,
            name: scorer.name,
            points: scorerResult.score,
            reason: scorerResult.explanation,
          });
        }
      } catch {
        // Extension scorers must fail gracefully without failing the entire assessment
      }
    }

    // Cap total score strictly between 0 and 100
    const riskScore = Math.min(100, Math.max(0, cumulativePoints));

    let riskLevel: FraudRiskLevel;
    let reviewStatus: FraudReviewStatus;

    if (riskScore < this.lowThreshold) {
      riskLevel = 'LOW';
      reviewStatus = 'AUTO_APPROVED';
    } else if (riskScore < this.highThreshold) {
      riskLevel = 'MEDIUM';
      reviewStatus = 'MANUAL_REVIEW';
    } else {
      riskLevel = 'HIGH';
      reviewStatus = 'PENDING';
    }

    const maskedFactors = this.maskFacts(facts);

    const explanation =
      triggeredRules.length === 0
        ? 'No fraud risk factors triggered. Order marked as LOW risk.'
        : `Assessment scored ${riskScore}/100 (${riskLevel} risk). Triggered rules: ${triggeredRules.map(r => `${r.name} (+${r.points}pts)`).join('; ')}`;

    return {
      riskScore,
      riskLevel,
      triggeredRules,
      factors: maskedFactors,
      explanation,
      reviewStatus,
      rulesVersion: this.rulesVersion,
    };
  }
}

export const fraudEngine = new FraudEngine();
