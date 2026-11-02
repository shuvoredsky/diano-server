const SENSITIVE_KEYS = new Set([
  'store_passwd',
  'store_password',
  'password',
  'cvv',
  'pin',
  'token',
  'secret',
]);

/**
 * Recursively redacts sensitive credentials, passwords, and card details from payment payloads.
 */
export function redactPaymentPayload(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactPaymentPayload(item));
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_KEYS.has(lowerKey)) {
      redacted[key] = '***REDACTED***';
    } else if (lowerKey.includes('card_no') || lowerKey.includes('cardnumber')) {
      if (typeof value === 'string' && value.length >= 4) {
        redacted[key] = `**** **** **** ${value.slice(-4)}`;
      } else {
        redacted[key] = '***REDACTED***';
      }
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactPaymentPayload(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
