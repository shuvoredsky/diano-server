import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  comparePassword,
  needsRehash,
  isPasswordStrong,
  PASSWORD_REGEX,
} from '@/utils/password.util';

describe('Password Util', () => {
  const strongPassword = 'SecurePassword123!';

  it('should hash a password and verify correctly', async () => {
    const hash = await hashPassword(strongPassword);
    expect(hash).toBeDefined();
    expect(hash).not.toEqual(strongPassword);
    expect(hash.startsWith('$2')).toBe(true);

    const isMatch = await comparePassword(strongPassword, hash);
    expect(isMatch).toBe(true);

    const isWrongMatch = await comparePassword('WrongPassword123!', hash);
    expect(isWrongMatch).toBe(false);
  });

  it('should detect if a password hash needs rehashing', async () => {
    const currentRoundHash = await hashPassword(strongPassword);
    // Hash created with fewer rounds (e.g. 2 rounds) than currently configured
    const lowRoundHash = '$2b$02$somearbitrarysaltandhashstring123456';
    expect(needsRehash(lowRoundHash)).toBe(true);
    expect(needsRehash(currentRoundHash)).toBe(false);
    expect(needsRehash('invalid-hash')).toBe(true);
  });

  it('should enforce password strength validation', () => {
    expect(isPasswordStrong(strongPassword)).toBe(true);
    expect(isPasswordStrong('Aa1!short')).toBe(true);

    // Too short (< 8 chars)
    expect(isPasswordStrong('Aa1!sho')).toBe(false);

    // Missing uppercase
    expect(isPasswordStrong('lowercase123!@#')).toBe(false);

    // Missing lowercase
    expect(isPasswordStrong('UPPERCASE123!@#')).toBe(false);

    // Missing number
    expect(isPasswordStrong('NoNumbersHere!@#')).toBe(false);

    // Missing special character
    expect(isPasswordStrong('NoSpecialChar123')).toBe(false);

    // Regexp matches policy
    expect(PASSWORD_REGEX.test(strongPassword)).toBe(true);
  });
});
