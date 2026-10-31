import { describe, it, expect } from 'vitest';
import { formatDhakaDate, toDhakaZonedTime, DHAKA_TIMEZONE } from '@/utils/date.util';

describe('Date Utility (Asia/Dhaka)', () => {
  it('should use Asia/Dhaka as default timezone constant', () => {
    expect(DHAKA_TIMEZONE).toBe('Asia/Dhaka');
  });

  it('should format a UTC ISO date in Asia/Dhaka (+06:00 offset)', () => {
    // 2026-10-31 06:00:00 UTC is 2026-10-31 12:00:00 in Dhaka
    const utcIso = '2026-10-31T06:00:00.000Z';
    const formatted = formatDhakaDate(utcIso, 'yyyy-MM-dd HH:mm:ss');
    expect(formatted).toBe('2026-10-31 12:00:00');
  });

  it('should format date with custom format string', () => {
    const utcIso = '2026-10-31T06:00:00.000Z';
    const formatted = formatDhakaDate(utcIso, 'dd/MM/yyyy');
    expect(formatted).toBe('31/10/2026');
  });

  it('should convert UTC date to Dhaka zoned time correctly', () => {
    const utcIso = '2026-10-31T06:00:00.000Z';
    const zoned = toDhakaZonedTime(utcIso);
    expect(zoned).toBeInstanceOf(Date);
  });

  it('should throw an error on invalid date input', () => {
    expect(() => formatDhakaDate('invalid-date-string')).toThrowError(/Invalid date/);
  });
});
