import { AppError } from '@/utils/app-error';

export type AnalyticsPeriod =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PeriodResolution {
  current: DateRange;
  previous: DateRange;
  period: AnalyticsPeriod;
  bucketType: 'hour' | 'day' | 'month';
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6

/**
 * Returns year, month (1-12), day, hour, minute, second, dayOfWeek (0=Sun..6=Sat) in Asia/Dhaka.
 */
export function getDhakaParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
} {
  const dhakaDate = new Date(date.getTime() + DHAKA_OFFSET_MS);
  return {
    year: dhakaDate.getUTCFullYear(),
    month: dhakaDate.getUTCMonth() + 1,
    day: dhakaDate.getUTCDate(),
    hour: dhakaDate.getUTCHours(),
    minute: dhakaDate.getUTCMinutes(),
    second: dhakaDate.getUTCSeconds(),
    dayOfWeek: dhakaDate.getUTCDay(),
  };
}

/**
 * Constructs a UTC Date object representing a specific Asia/Dhaka local date/time.
 */
export function createDhakaDate(
  year: number,
  month: number, // 1-based (1-12)
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 6, minute, second, ms));
}

/**
 * Formats a Date object in Asia/Dhaka timezone.
 */
export function formatDhakaDate(
  date: Date,
  type: 'date' | 'day' | 'hour' | 'month' = 'date',
): string {
  const parts = getDhakaParts(date);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = parts.year;
  const m = pad(parts.month);
  const d = pad(parts.day);
  const h = pad(parts.hour);

  if (type === 'month') return `${y}-${m}`;
  if (type === 'hour') return `${y}-${m}-${d} ${h}:00`;
  return `${y}-${m}-${d}`;
}

/**
 * Resolves [start, end) half-open intervals in UTC for both the requested period and its comparison period.
 */
export function resolvePeriod(
  period: AnalyticsPeriod,
  from?: string | Date,
  to?: string | Date,
  referenceDate: Date = new Date(),
): PeriodResolution {
  const dhaka = getDhakaParts(referenceDate);

  let currentStart: Date;
  let currentEnd: Date;
  let previousStart: Date;
  let previousEnd: Date;
  let bucketType: 'hour' | 'day' | 'month';

  switch (period) {
    case 'today': {
      currentStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day);
      currentEnd = createDhakaDate(dhaka.year, dhaka.month, dhaka.day + 1);
      previousStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - 1);
      previousEnd = currentStart;
      bucketType = 'hour';
      break;
    }

    case 'yesterday': {
      currentStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - 1);
      currentEnd = createDhakaDate(dhaka.year, dhaka.month, dhaka.day);
      previousStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - 2);
      previousEnd = currentStart;
      bucketType = 'hour';
      break;
    }

    case 'last_7_days': {
      // 7 complete days ending tomorrow midnight Dhaka
      currentEnd = createDhakaDate(dhaka.year, dhaka.month, dhaka.day + 1);
      currentStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - 6);
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      previousStart = new Date(currentStart.getTime() - durationMs);
      previousEnd = currentStart;
      bucketType = 'day';
      break;
    }

    case 'last_30_days': {
      currentEnd = createDhakaDate(dhaka.year, dhaka.month, dhaka.day + 1);
      currentStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - 29);
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      previousStart = new Date(currentStart.getTime() - durationMs);
      previousEnd = currentStart;
      bucketType = 'day';
      break;
    }

    case 'this_week': {
      // Week starts Saturday (day 6).
      // Saturday offset = (dayOfWeek + 1) % 7
      // e.g. Saturday (6) -> 0 days ago. Sunday (0) -> 1 day ago. Friday (5) -> 6 days ago.
      const daysSinceSaturday = (dhaka.dayOfWeek + 1) % 7;
      currentStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - daysSinceSaturday);
      currentEnd = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - daysSinceSaturday + 7);
      previousStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - daysSinceSaturday - 7);
      previousEnd = currentStart;
      bucketType = 'day';
      break;
    }

    case 'last_week': {
      const daysSinceSaturday = (dhaka.dayOfWeek + 1) % 7;
      currentStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - daysSinceSaturday - 7);
      currentEnd = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - daysSinceSaturday);
      previousStart = createDhakaDate(dhaka.year, dhaka.month, dhaka.day - daysSinceSaturday - 14);
      previousEnd = currentStart;
      bucketType = 'day';
      break;
    }

    case 'this_month': {
      currentStart = createDhakaDate(dhaka.year, dhaka.month, 1);
      currentEnd = createDhakaDate(dhaka.year, dhaka.month + 1, 1);
      previousStart = createDhakaDate(dhaka.year, dhaka.month - 1, 1);
      previousEnd = currentStart;
      bucketType = 'day';
      break;
    }

    case 'last_month': {
      currentStart = createDhakaDate(dhaka.year, dhaka.month - 1, 1);
      currentEnd = createDhakaDate(dhaka.year, dhaka.month, 1);
      previousStart = createDhakaDate(dhaka.year, dhaka.month - 2, 1);
      previousEnd = currentStart;
      bucketType = 'day';
      break;
    }

    case 'this_year': {
      currentStart = createDhakaDate(dhaka.year, 1, 1);
      currentEnd = createDhakaDate(dhaka.year + 1, 1, 1);
      previousStart = createDhakaDate(dhaka.year - 1, 1, 1);
      previousEnd = currentStart;
      bucketType = 'month';
      break;
    }

    case 'last_year': {
      currentStart = createDhakaDate(dhaka.year - 1, 1, 1);
      currentEnd = createDhakaDate(dhaka.year, 1, 1);
      previousStart = createDhakaDate(dhaka.year - 2, 1, 1);
      previousEnd = currentStart;
      bucketType = 'month';
      break;
    }

    case 'custom': {
      if (!from || !to) {
        throw AppError.badRequest("Custom period requires both 'from' and 'to' date parameters");
      }
      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw AppError.badRequest('Invalid date format for custom period');
      }

      if (fromDate > toDate) {
        throw AppError.badRequest("'from' date cannot be greater than 'to' date");
      }

      const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 366) {
        throw AppError.badRequest('Custom date range cannot exceed 366 days');
      }

      const fromDhaka = getDhakaParts(fromDate);
      const toDhaka = getDhakaParts(toDate);

      currentStart = createDhakaDate(fromDhaka.year, fromDhaka.month, fromDhaka.day);
      // Half-open interval: end is start of next day
      currentEnd = createDhakaDate(toDhaka.year, toDhaka.month, toDhaka.day + 1);

      const durationMs = currentEnd.getTime() - currentStart.getTime();
      previousStart = new Date(currentStart.getTime() - durationMs);
      previousEnd = currentStart;

      bucketType = diffDays <= 2 ? 'hour' : diffDays <= 90 ? 'day' : 'month';
      break;
    }

    default:
      throw AppError.badRequest(`Unsupported period '${period}'`);
  }

  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
    period,
    bucketType,
  };
}

/**
 * Calculates percentage change and trend direction safely.
 */
export function calculateChange(
  current: number,
  previous: number,
): {
  change: number;
  percent: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
} {
  const change = Math.round((current - previous) * 100) / 100;
  let percent: number;

  if (previous === 0) {
    percent = current === 0 ? 0 : 100;
  } else {
    percent = Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
  }

  const trend: 'UP' | 'DOWN' | 'FLAT' = current > previous ? 'UP' : current < previous ? 'DOWN' : 'FLAT';

  return { change, percent, trend };
}

/**
 * Generates continuous time buckets between start and end in Asia/Dhaka.
 */
export function generateDateBuckets(
  start: Date,
  end: Date,
  type: 'hour' | 'day' | 'month',
): string[] {
  const buckets: string[] = [];
  const cursor = new Date(start.getTime());

  while (cursor < end) {
    buckets.push(formatDhakaDate(cursor, type));

    if (type === 'hour') {
      cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
    } else if (type === 'day') {
      cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
    } else {
      // Month increment in Dhaka
      const parts = getDhakaParts(cursor);
      const nextMonth = createDhakaDate(parts.year, parts.month + 1, 1);
      cursor.setTime(nextMonth.getTime());
    }
  }

  return buckets;
}

/**
 * Fills missing buckets in a chart series with zero/default data.
 */
export function gapFillSeries<T>(
  buckets: string[],
  dataMap: Map<string, T>,
  defaultFactory: (bucket: string) => T,
): T[] {
  return buckets.map(bucket => {
    const existing = dataMap.get(bucket);
    return existing !== undefined ? existing : defaultFactory(bucket);
  });
}
