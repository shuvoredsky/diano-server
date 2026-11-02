import type {
  FraudRuleFacts,
  RuleEvaluationResult,
  RuleEvaluatorFn,
} from './fraud.types';

export const evaluateRepeatedCodCancellations: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const threshold = Number(params.threshold ?? 2);
  const weight = Number(params.weight ?? 35);
  const count = facts.history?.cancelledCodCount ?? 0;

  if (count >= threshold) {
    return {
      triggered: true,
      points: weight,
      reason: `${count} COD orders were cancelled in recent order history (threshold: ${threshold})`,
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

export const evaluateMultipleOrdersSamePhone: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const threshold = Number(params.threshold ?? 3);
  const weight = Number(params.weight ?? 30);
  const count = facts.history?.ordersSamePhoneShortWindow ?? 0;

  if (count >= threshold) {
    return {
      triggered: true,
      points: weight,
      reason: `${count} orders placed with the same phone in a short time window (threshold: ${threshold})`,
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

export const evaluateHighOrderFrequency: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const threshold = Number(params.threshold ?? 5);
  const weight = Number(params.weight ?? 25);
  const count = facts.history?.orderFrequency24h ?? 0;

  if (count >= threshold) {
    return {
      triggered: true,
      points: weight,
      reason: `High velocity order burst: ${count} orders within 24 hours (threshold: ${threshold})`,
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

export const evaluateUnusualQuantityOrValue: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const thresholdValue = Number(params.thresholdValue ?? 50000);
  const thresholdQuantity = Number(params.thresholdQuantity ?? 15);
  const weight = Number(params.weight ?? 25);

  const valueExceeded = facts.grandTotal >= thresholdValue;
  const qtyExceeded = facts.itemCount >= thresholdQuantity;

  if (valueExceeded || qtyExceeded) {
    const reasons: string[] = [];
    if (valueExceeded) reasons.push(`grand total BDT ${facts.grandTotal} >= ${thresholdValue}`);
    if (qtyExceeded) reasons.push(`item count ${facts.itemCount} >= ${thresholdQuantity}`);

    return {
      triggered: true,
      points: weight,
      reason: `Unusual order threshold exceeded: ${reasons.join(', ')}`,
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

export const evaluateRepeatedPaymentFailures: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const threshold = Number(params.threshold ?? 3);
  const weight = Number(params.weight ?? 30);
  const count = facts.history?.failedPaymentAttempts24h ?? 0;

  if (count >= threshold) {
    return {
      triggered: true,
      points: weight,
      reason: `${count} failed online payment attempts recorded in the last 24 hours (threshold: ${threshold})`,
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

export const evaluatePreviousConfirmedFraud: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const weight = Number(params.weight ?? 50);
  const isConfirmed = facts.history?.previousConfirmedFraud === true;

  if (isConfirmed) {
    return {
      triggered: true,
      points: weight,
      reason: 'Customer account or phone has previous admin confirmed-fraud rejection',
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

export const evaluateAddressReuseAcrossAccounts: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const threshold = Number(params.threshold ?? 3);
  const weight = Number(params.weight ?? 30);
  const count = facts.history?.distinctAccountsSharingAddress ?? 0;

  if (count >= threshold) {
    return {
      triggered: true,
      points: weight,
      reason: `Delivery address is reused across ${count} distinct user accounts (threshold: ${threshold})`,
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

export const evaluateNewAccountHighValueCod: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const codValueThreshold = Number(params.codValueThreshold ?? 15000);
  const accountAgeHours = Number(params.accountAgeHours ?? 24);
  const weight = Number(params.weight ?? 35);

  const isCod = facts.paymentMethod.toUpperCase() === 'COD';
  if (!isCod) {
    return { triggered: false, points: 0, reason: '' };
  }

  const isHighValue = facts.grandTotal >= codValueThreshold;
  if (!isHighValue) {
    return { triggered: false, points: 0, reason: '' };
  }

  let isNewAccount = facts.isGuest;
  if (!isNewAccount && facts.customerCreatedAt) {
    const ageMs = Date.now() - new Date(facts.customerCreatedAt).getTime();
    if (ageMs < accountAgeHours * 3600000) {
      isNewAccount = true;
    }
  }

  if (isNewAccount) {
    return {
      triggered: true,
      points: weight,
      reason: `New account or guest placing high value COD order (BDT ${facts.grandTotal} >= ${codValueThreshold})`,
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

/**
 * Weak Signal Rule: Suspicious Device Pattern
 * Note: IP / shared device alone NEVER blocks or causes HIGH risk.
 * Maximum points strictly capped at 15 to ensure it is never single-handedly HIGH.
 */
export const evaluateSuspiciousDevicePattern: RuleEvaluatorFn = (
  facts: FraudRuleFacts,
  params: Record<string, unknown>,
): RuleEvaluationResult => {
  const weight = Math.min(15, Number(params.weight ?? 15)); // Strictly capped at 15 points
  const suspiciousCategory =
    facts.deviceCategory === 'BOT' ||
    facts.deviceCategory === 'TOR_NODE' ||
    (facts.userAgent && /python-requests|curl|postman|insomnia|scrapy/i.test(facts.userAgent));

  if (suspiciousCategory) {
    return {
      triggered: true,
      points: weight,
      reason: `Anomalous client header pattern (${facts.deviceCategory || 'Automated client'})`,
    };
  }

  return { triggered: false, points: 0, reason: '' };
};

export const FRAUD_RULES_REGISTRY: Record<string, { evaluator: RuleEvaluatorFn; defaultWeight: number }> = {
  REPEATED_COD_CANCELLATIONS: {
    evaluator: evaluateRepeatedCodCancellations,
    defaultWeight: 35,
  },
  MULTIPLE_ORDERS_SAME_PHONE: {
    evaluator: evaluateMultipleOrdersSamePhone,
    defaultWeight: 30,
  },
  HIGH_ORDER_FREQUENCY: {
    evaluator: evaluateHighOrderFrequency,
    defaultWeight: 25,
  },
  UNUSUAL_ORDER_VALUE_OR_QUANTITY: {
    evaluator: evaluateUnusualQuantityOrValue,
    defaultWeight: 25,
  },
  REPEATED_PAYMENT_FAILURES: {
    evaluator: evaluateRepeatedPaymentFailures,
    defaultWeight: 30,
  },
  PREVIOUS_CONFIRMED_FRAUD: {
    evaluator: evaluatePreviousConfirmedFraud,
    defaultWeight: 50,
  },
  ADDRESS_REUSE_ACROSS_ACCOUNTS: {
    evaluator: evaluateAddressReuseAcrossAccounts,
    defaultWeight: 30,
  },
  NEW_ACCOUNT_HIGH_VALUE_COD: {
    evaluator: evaluateNewAccountHighValueCod,
    defaultWeight: 35,
  },
  SUSPICIOUS_DEVICE_PATTERN: {
    evaluator: evaluateSuspiciousDevicePattern,
    defaultWeight: 15,
  },
};
