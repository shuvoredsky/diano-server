import Decimal from 'decimal.js';
import { roundMoney, toDecimal, type NumericValue } from '@/utils/currency.util';
import { AppError } from '@/utils/app-error';

export type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED';

export interface PricingCalculationInput {
  mrp: NumericValue;
  discountType?: DiscountType | null;
  discountValue?: NumericValue | null;
  costPrice?: NumericValue | null;
  // Intentionally allowing client-submitted sellingPrice in input type to verify it gets ignored
  sellingPrice?: NumericValue | null;
}

export interface PricingCalculationResult {
  mrp: Decimal;
  discountType: DiscountType;
  discountValue: Decimal;
  discountAmount: Decimal;
  sellingPrice: Decimal;
  warnings?: string[];
}

/**
 * Pure function: Calculates product pricing breakdown and enforces business discount rules.
 * All client-submitted sellingPrice values are strictly ignored.
 */
export function calculatePricing(input: PricingCalculationInput): PricingCalculationResult {
  const mrp = roundMoney(toDecimal(input.mrp));

  if (mrp.lessThanOrEqualTo(0)) {
    throw AppError.badRequest('MRP must be greater than zero');
  }

  const discountType: DiscountType = input.discountType ?? 'NONE';
  let discountValue = input.discountValue ? toDecimal(input.discountValue) : new Decimal(0);
  let discountAmount: Decimal;
  let sellingPrice: Decimal;
  const warnings: string[] = [];

  switch (discountType) {
    case 'NONE': {
      if (!discountValue.isZero()) {
        throw AppError.badRequest('Discount value must be 0 or null when discount type is NONE');
      }
      discountValue = new Decimal(0);
      discountAmount = new Decimal(0);
      sellingPrice = mrp;
      break;
    }

    case 'PERCENTAGE': {
      if (discountValue.lessThanOrEqualTo(0)) {
        throw AppError.badRequest('Percentage discount must be greater than 0%');
      }
      if (discountValue.greaterThanOrEqualTo(100)) {
        throw AppError.badRequest('Percentage discount must be strictly less than 100% to maintain a positive selling price');
      }

      // Calculate discount amount with half-up 2-decimal rounding
      const rawDiscount = mrp.times(discountValue).dividedBy(100);
      discountAmount = roundMoney(rawDiscount);
      sellingPrice = roundMoney(mrp.minus(discountAmount));
      break;
    }

    case 'FIXED': {
      if (discountValue.lessThanOrEqualTo(0)) {
        throw AppError.badRequest('Fixed discount value must be greater than 0');
      }
      if (discountValue.greaterThanOrEqualTo(mrp)) {
        throw AppError.badRequest(`Fixed discount must be strictly less than MRP (${mrp.toFixed(2)})`);
      }

      discountAmount = roundMoney(discountValue);
      sellingPrice = roundMoney(mrp.minus(discountAmount));
      break;
    }

    default: {
      throw AppError.badRequest(`Unsupported discount type: ${String(discountType)}`);
    }
  }

  if (sellingPrice.lessThanOrEqualTo(0)) {
    throw AppError.badRequest('Calculated selling price must be greater than zero');
  }

  // Cost price margin check (warning only, never blocks creation)
  if (input.costPrice !== undefined && input.costPrice !== null) {
    const costPrice = roundMoney(toDecimal(input.costPrice));
    if (costPrice.greaterThan(0) && sellingPrice.lessThan(costPrice)) {
      warnings.push(
        `Calculated selling price (${sellingPrice.toFixed(2)}) is less than unit cost price (${costPrice.toFixed(2)})`,
      );
    }
  }

  return {
    mrp,
    discountType,
    discountValue,
    discountAmount,
    sellingPrice,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
