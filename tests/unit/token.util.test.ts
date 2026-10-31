import { describe, it, expect } from 'vitest';
import { generateRandomToken, hashToken, generateNumericOtp } from '@/utils/token.util';

describe('Token Util', () => {
  it('should generate cryptographically random hex tokens of expected length', () => {
    const token32 = generateRandomToken(32);
    expect(token32).toBeDefined();
    expect(token32).toHaveLength(64); // 32 bytes = 64 hex characters

    const token16 = generateRandomToken(16);
    expect(token16).toHaveLength(32); // 16 bytes = 32 hex characters

    // Tokens must be unique
    const tokenA = generateRandomToken();
    const tokenB = generateRandomToken();
    expect(tokenA).not.toEqual(tokenB);
  });

  it('should compute deterministic SHA-256 hash', () => {
    const testString = 'super-secret-token-value';
    const hash1 = hashToken(testString);
    const hash2 = hashToken(testString);

    expect(hash1).toHaveLength(64); // SHA-256 hex is always 64 characters
    expect(hash1).toEqual(hash2);

    const differentHash = hashToken('different-string');
    expect(hash1).not.toEqual(differentHash);
  });

  it('should generate numeric OTP of specified length', () => {
    const otp6 = generateNumericOtp(6);
    expect(otp6).toMatch(/^\d{6}$/);

    const otp4 = generateNumericOtp(4);
    expect(otp4).toMatch(/^\d{4}$/);

    // Consecutive OTPs should not be identical
    const otpA = generateNumericOtp(6);
    const otpB = generateNumericOtp(6);
    expect(otpA).toBeDefined();
    expect(otpB).toBeDefined();
  });
});
