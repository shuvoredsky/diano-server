import { describe, it, expect } from 'vitest';
import {
  sanitizeCellValue,
  maskPhone,
  maskEmail,
} from '@/modules/reports/reports.types';
import { ReportsService } from '@/modules/reports/reports.service';

describe('Reports Utilities & Security Defenses', () => {
  it('prevents formula injection by prefixing dangerous characters with single quote', () => {
    // Dangerous formulas starting with =, +, -, @, or tab
    expect(sanitizeCellValue('=1+1')).toBe("'=1+1");
    expect(sanitizeCellValue('+100')).toBe("'+100");
    expect(sanitizeCellValue('-25.5')).toBe("'-25.5");
    expect(sanitizeCellValue('@SUM(A1:B10)')).toBe("'@SUM(A1:B10)");
    expect(sanitizeCellValue('\tHiddenTab')).toBe("'\tHiddenTab");

    // Regular strings and values remain untouched
    expect(sanitizeCellValue('Order #1001')).toBe('Order #1001');
    expect(sanitizeCellValue('Dhaka, Bangladesh')).toBe('Dhaka, Bangladesh');
    expect(sanitizeCellValue(12345)).toBe(12345);
    expect(sanitizeCellValue(null)).toBe('');
    expect(sanitizeCellValue(undefined)).toBe('');
  });

  it('masks phone numbers to protect customer PII', () => {
    expect(maskPhone('01712345678')).toBe('017****5678');
    expect(maskPhone('+8801812345678')).toBe('+88****5678');
    expect(maskPhone('12345')).toBe('****');
    expect(maskPhone('')).toBe('');
    expect(maskPhone(null)).toBe('');
  });

  it('masks email addresses to protect customer PII', () => {
    expect(maskEmail('shuvo@diano.com')).toBe('s***o@diano.com');
    expect(maskEmail('alexander@example.com')).toBe('a***r@example.com');
    expect(maskEmail('ab@test.com')).toBe('a***@test.com');
    expect(maskEmail('invalid-email')).toBe('****');
    expect(maskEmail('')).toBe('');
    expect(maskEmail(null)).toBe('');
  });

  it('enforces maximum row limit of 20,000 to prevent OOM', () => {
    const service = new ReportsService();
    // @ts-expect-error accessing private method for unit verification
    expect(() => service.checkRowLimit(20000)).not.toThrow();

    // @ts-expect-error accessing private method for unit verification
    expect(() => service.checkRowLimit(20001)).toThrow(
      /Export exceeds maximum row limit of 20000/,
    );
  });
});
