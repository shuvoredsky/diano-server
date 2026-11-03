import { describe, it, expect } from 'vitest';
import {
  getDhakaParts,
  createDhakaDate,
  formatDhakaDate,
  resolvePeriod,
  calculateChange,
  generateDateBuckets,
  gapFillSeries,
} from '@/modules/analytics/period.util';

describe('Period Utilities (Asia/Dhaka & Calculations)', () => {
  it('correctly maps Asia/Dhaka local midnight to UTC (UTC+6)', () => {
    // 2026-11-03 00:00:00 in Dhaka (UTC+6) should be 2026-11-02 18:00:00.000Z in UTC
    const dhakaMidnight = createDhakaDate(2026, 11, 3, 0, 0, 0);
    expect(dhakaMidnight.toISOString()).toBe('2026-11-02T18:00:00.000Z');

    const parts = getDhakaParts(dhakaMidnight);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(11);
    expect(parts.day).toBe(3);
    expect(parts.hour).toBe(0);
  });

  it('formats dates in Asia/Dhaka correctly', () => {
    const date = new Date('2026-11-02T18:30:00.000Z'); // 00:30 on Nov 3 in Dhaka
    expect(formatDhakaDate(date, 'date')).toBe('2026-11-03');
    expect(formatDhakaDate(date, 'hour')).toBe('2026-11-03 00:00');
    expect(formatDhakaDate(date, 'month')).toBe('2026-11');
  });

  it('resolves [start, end) half-open intervals for today and yesterday', () => {
    // Reference date: 2026-11-03 14:00:00 Dhaka = 2026-11-03 08:00:00 UTC
    const ref = new Date('2026-11-03T08:00:00.000Z');

    const today = resolvePeriod('today', undefined, undefined, ref);
    expect(today.current.start.toISOString()).toBe('2026-11-02T18:00:00.000Z'); // Nov 3 00:00 Dhaka
    expect(today.current.end.toISOString()).toBe('2026-11-03T18:00:00.000Z'); // Nov 4 00:00 Dhaka
    expect(today.previous.start.toISOString()).toBe('2026-11-01T18:00:00.000Z'); // Nov 2 00:00 Dhaka
    expect(today.previous.end.toISOString()).toBe('2026-11-02T18:00:00.000Z');

    const yesterday = resolvePeriod('yesterday', undefined, undefined, ref);
    expect(yesterday.current.start.toISOString()).toBe('2026-11-01T18:00:00.000Z');
    expect(yesterday.current.end.toISOString()).toBe('2026-11-02T18:00:00.000Z');
  });

  it('resolves calendar periods this_month and last_month', () => {
    const ref = new Date('2026-11-15T08:00:00.000Z'); // Nov 15, 2026

    const thisMonth = resolvePeriod('this_month', undefined, undefined, ref);
    expect(thisMonth.current.start.toISOString()).toBe('2026-10-31T18:00:00.000Z'); // Nov 1 00:00 Dhaka
    expect(thisMonth.current.end.toISOString()).toBe('2026-11-30T18:00:00.000Z'); // Dec 1 00:00 Dhaka
    expect(thisMonth.previous.start.toISOString()).toBe('2026-09-30T18:00:00.000Z'); // Oct 1 00:00 Dhaka
    expect(thisMonth.previous.end.toISOString()).toBe('2026-10-31T18:00:00.000Z'); // Nov 1 00:00 Dhaka
  });

  it('resolves this_week (starting Saturday in BD style)', () => {
    // 2026-11-03 is Tuesday (dayOfWeek = 2). Saturday was Oct 31, 2026.
    const ref = new Date('2026-11-03T08:00:00.000Z');
    const thisWeek = resolvePeriod('this_week', undefined, undefined, ref);

    // Current week: Oct 31 00:00 Dhaka to Nov 7 00:00 Dhaka
    expect(thisWeek.current.start.toISOString()).toBe('2026-10-30T18:00:00.000Z');
    expect(thisWeek.current.end.toISOString()).toBe('2026-11-06T18:00:00.000Z');
  });

  it('resolves rolling periods: last_7_days and last_30_days', () => {
    const ref = new Date('2026-11-03T08:00:00.000Z');
    const l7 = resolvePeriod('last_7_days', undefined, undefined, ref);

    const diffMs = l7.current.end.getTime() - l7.current.start.getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);

    const prevDiffMs = l7.previous.end.getTime() - l7.previous.start.getTime();
    expect(prevDiffMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(l7.previous.end.getTime()).toBe(l7.current.start.getTime());
  });

  it('resolves custom period with valid boundaries and validation', () => {
    const custom = resolvePeriod('custom', '2026-10-01', '2026-10-15');
    expect(formatDhakaDate(custom.current.start, 'date')).toBe('2026-10-01');
    expect(formatDhakaDate(custom.current.end, 'date')).toBe('2026-10-16'); // half-open next midnight
  });

  it('calculates trend and percentage change correctly with edge cases', () => {
    expect(calculateChange(150, 100)).toEqual({
      change: 50,
      percent: 50,
      trend: 'UP',
    });

    expect(calculateChange(80, 100)).toEqual({
      change: -20,
      percent: -20,
      trend: 'DOWN',
    });

    expect(calculateChange(100, 100)).toEqual({
      change: 0,
      percent: 0,
      trend: 'FLAT',
    });

    // Zero previous
    expect(calculateChange(50, 0)).toEqual({
      change: 50,
      percent: 100,
      trend: 'UP',
    });

    // Both zero
    expect(calculateChange(0, 0)).toEqual({
      change: 0,
      percent: 0,
      trend: 'FLAT',
    });
  });

  it('generates continuous date buckets and fills gaps', () => {
    const start = createDhakaDate(2026, 11, 1);
    const end = createDhakaDate(2026, 11, 4);

    const buckets = generateDateBuckets(start, end, 'day');
    expect(buckets).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);

    const sparseData = new Map([
      ['2026-11-01', { bucket: '2026-11-01', val: 100 }],
      ['2026-11-03', { bucket: '2026-11-03', val: 300 }],
    ]);

    const filled = gapFillSeries(buckets, sparseData, b => ({ bucket: b, val: 0 }));
    expect(filled).toEqual([
      { bucket: '2026-11-01', val: 100 },
      { bucket: '2026-11-02', val: 0 },
      { bucket: '2026-11-03', val: 300 },
    ]);
  });
});
