import { describe, it, expect } from 'vitest';
import {
  toDecimal,
  roundMoney,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  formatBDT,
  DEFAULT_CURRENCY,
} from '@/utils/currency.util';

describe('Currency Utility (Decimal.js & BDT)', () => {
  it('should have BDT as default currency', () => {
    expect(DEFAULT_CURRENCY).toBe('BDT');
  });

  it('should convert numbers and strings to Decimal instances', () => {
    const d1 = toDecimal(100.5);
    const d2 = toDecimal('250.75');
    expect(d1.toNumber()).toBe(100.5);
    expect(d2.toNumber()).toBe(250.75);
  });

  it('should round money to 2 decimal places using half-up', () => {
    expect(roundMoney('10.555').toString()).toBe('10.56');
    expect(roundMoney('10.554').toString()).toBe('10.55');
  });

  it('should accurately perform addition avoiding floating point issues', () => {
    // 0.1 + 0.2 in JS is 0.30000000000000004
    const result = addMoney(0.1, 0.2);
    expect(result.toString()).toBe('0.3');
  });

  it('should perform subtraction accurately', () => {
    const result = subtractMoney('100.00', '45.25');
    expect(result.toString()).toBe('54.75');
  });

  it('should perform multiplication and round appropriately', () => {
    const result = multiplyMoney('12.50', 3);
    expect(result.toString()).toBe('37.5');
  });

  it('should perform division accurately and reject division by zero', () => {
    const result = divideMoney('100.00', 3);
    expect(result.toString()).toBe('33.33');
    expect(() => divideMoney('100.00', 0)).toThrowError(/Division by zero/);
  });

  it('should format amounts in BDT with thousands separators and 2 decimals', () => {
    expect(formatBDT(1250)).toBe('BDT 1,250.00');
    expect(formatBDT('1250000.5')).toBe('BDT 1,250,000.50');
    expect(formatBDT(0)).toBe('BDT 0.00');
  });
});
