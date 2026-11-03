import { describe, it, expect } from 'vitest';
import { validateEnv } from '@/config/env.config';

describe('Environment Validation', () => {
  const baseValidEnv = {
    NODE_ENV: 'test',
    PORT: '5000',
    JWT_ACCESS_SECRET: '12345678901234567890123456789012', // 32 chars
    JWT_REFRESH_SECRET: 'abcdefabcdefabcdefabcdefabcdefab', // 32 chars
    JWT_RESET_PASSWORD_SECRET: 'xyzxyzxyzxyzxyzxyzxyzxyzxyzxyzxy', // 32 chars
    COOKIE_SECRET: 'cookie_secret_at_least_32_characters_long',
  };

  it('should pass validation when required environment variables are present and valid', () => {
    const config = validateEnv(baseValidEnv);
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(5000);
    expect(config.DEFAULT_CURRENCY).toBe('BDT');
    expect(config.DEFAULT_TIMEZONE).toBe('Asia/Dhaka');
  });

  it('should throw an error if JWT_ACCESS_SECRET is less than 32 characters', () => {
    const invalidEnv = {
      ...baseValidEnv,
      JWT_ACCESS_SECRET: 'short_secret',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/JWT_ACCESS_SECRET must be at least 32 characters/);
  });

  it('should throw an error if NODE_ENV has an invalid value', () => {
    const invalidEnv = {
      ...baseValidEnv,
      NODE_ENV: 'invalid_environment',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/NODE_ENV|Invalid option|Invalid enum/);
  });

  it('should reject payment providers other than COD and SSLCOMMERZ in PAYMENT_ENABLED_PROVIDERS', () => {
    const invalidEnv = {
      ...baseValidEnv,
      PAYMENT_ENABLED_PROVIDERS: 'COD,SSLCOMMERZ,BKASH',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/Invalid payment provider 'BKASH'/);
  });

  it('should reject JOBS_SECRET if shorter than 32 characters', () => {
    const invalidEnv = {
      ...baseValidEnv,
      JOBS_SECRET: 'short-secret',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/JOBS_SECRET must be at least 32 characters/);
  });
});
