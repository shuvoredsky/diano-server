import crypto from 'crypto';

/**
 * Generates a cryptographically secure random token (hex string).
 */
export const generateRandomToken = (byteLength = 32): string => {
  return crypto.randomBytes(byteLength).toString('hex');
};

/**
 * Computes a SHA-256 hash of a token string.
 * Used to store one-way representations of refresh tokens, reset tokens, and OTPs in the DB.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generates a random numeric OTP code of specified length (default 6 digits).
 */
export const generateNumericOtp = (digits = 6): string => {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return crypto.randomInt(min, max + 1).toString();
};
