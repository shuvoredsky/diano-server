import Decimal from 'decimal.js';

export const DEFAULT_CURRENCY = 'BDT';

// Configure Decimal for precise financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type NumericValue = string | number | Decimal;

/**
 * Safely converts an input value to a Decimal instance
 */
export const toDecimal = (value: NumericValue): Decimal => {
  try {
    return new Decimal(value);
  } catch {
    throw new Error(`Invalid numeric/money value: ${String(value)}`);
  }
};

/**
 * Rounds monetary value to 2 decimal places (standard for BDT)
 */
export const roundMoney = (value: NumericValue): Decimal => {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
};

/**
 * Adds two monetary amounts
 */
export const addMoney = (a: NumericValue, b: NumericValue): Decimal => {
  return roundMoney(toDecimal(a).plus(toDecimal(b)));
};

/**
 * Subtracts b from a
 */
export const subtractMoney = (a: NumericValue, b: NumericValue): Decimal => {
  return roundMoney(toDecimal(a).minus(toDecimal(b)));
};

/**
 * Multiplies an amount by quantity/multiplier
 */
export const multiplyMoney = (amount: NumericValue, multiplier: NumericValue): Decimal => {
  return roundMoney(toDecimal(amount).times(toDecimal(multiplier)));
};

/**
 * Divides an amount by divisor
 */
export const divideMoney = (amount: NumericValue, divisor: NumericValue): Decimal => {
  const div = toDecimal(divisor);
  if (div.isZero()) {
    throw new Error('Division by zero is not allowed in monetary operations');
  }
  return roundMoney(toDecimal(amount).dividedBy(div));
};

/**
 * Formats a Decimal / number as BDT currency string
 * Example: formatBDT(1250.5) => "BDT 1,250.50"
 */
export const formatBDT = (amount: NumericValue): string => {
  const rounded = roundMoney(amount);
  const parts = rounded.toFixed(2).split('.');
  const intPart = parts[0] ?? '0';
  const decPart = parts[1] ?? '00';
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${DEFAULT_CURRENCY} ${formattedInt}.${decPart}`;
};
