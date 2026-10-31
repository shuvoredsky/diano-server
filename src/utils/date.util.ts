import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { isValid, parseISO } from 'date-fns';

export const DHAKA_TIMEZONE = 'Asia/Dhaka';

/**
 * Returns current Date object
 */
export const getDhakaNow = (): Date => {
  return new Date();
};

/**
 * Formats a given date in Asia/Dhaka timezone
 */
export const formatDhakaDate = (
  date: Date | string | number,
  formatString = 'yyyy-MM-dd HH:mm:ss',
): string => {
  const parsedDate = typeof date === 'string' ? parseISO(date) : new Date(date);
  if (!isValid(parsedDate)) {
    throw new Error('Invalid date provided to formatDhakaDate');
  }
  return formatInTimeZone(parsedDate, DHAKA_TIMEZONE, formatString);
};

/**
 * Converts a date to Dhaka zoned time
 */
export const toDhakaZonedTime = (date: Date | string | number): Date => {
  const parsedDate = typeof date === 'string' ? parseISO(date) : new Date(date);
  if (!isValid(parsedDate)) {
    throw new Error('Invalid date provided to toDhakaZonedTime');
  }
  return toZonedTime(parsedDate, DHAKA_TIMEZONE);
};

/**
 * Converts a local Dhaka zoned time back to UTC Date
 */
export const fromDhakaZonedTime = (date: Date | string | number): Date => {
  const parsedDate = typeof date === 'string' ? parseISO(date) : new Date(date);
  if (!isValid(parsedDate)) {
    throw new Error('Invalid date provided to fromDhakaZonedTime');
  }
  return fromZonedTime(parsedDate, DHAKA_TIMEZONE);
};
