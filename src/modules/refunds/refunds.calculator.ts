import Decimal from 'decimal.js';
import type {
  ProportionalRefundInput,
  ProportionalRefundResult,
} from './refunds.types';

/**
 * Pure calculation function for proportional coupon discount refund calculation.
 * Ensures:
 * 1. Each returned item absorbs its fair proportional share of the order coupon discount.
 * 2. Refund never exceeds the net amount paid by the customer.
 * 3. Cumulative refunds never exceed (orderTotalPaid - orderTotalRefunded).
 * 4. Deterministic 2 decimal precision (Decimal.ROUND_HALF_UP).
 */
export function calculateProportionalReturnRefund(
  input: ProportionalRefundInput,
): ProportionalRefundResult {
  const subtotalDec = new Decimal(input.orderSubtotal);
  const discountTotalDec = new Decimal(input.orderDiscountTotal || '0.00');
  const shippingTotalDec = new Decimal(input.orderShippingTotal || '0.00');
  const totalPaidDec = new Decimal(input.orderTotalPaid);
  const totalRefundedDec = new Decimal(input.orderTotalRefunded || '0.00');

  // Max refundable balance available
  const maxRefundableDec = Decimal.max(0, totalPaidDec.minus(totalRefundedDec));

  let itemsRefundTotalDec = new Decimal(0);
  const breakdown: ProportionalRefundResult['breakdown'] = [];

  for (const item of input.returnedItems) {
    const lineTotalDec = new Decimal(item.lineTotal);

    let proportionalDiscountDec = new Decimal(0);
    if (subtotalDec.greaterThan(0) && discountTotalDec.greaterThan(0)) {
      // itemProportion = itemLineTotal / orderSubtotal
      // proportionalDiscount = round(orderDiscountTotal * itemProportion)
      proportionalDiscountDec = discountTotalDec
        .times(lineTotalDec)
        .dividedBy(subtotalDec)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    // Refund for item = lineTotal - proportional discount
    const itemRefundableDec = Decimal.max(0, lineTotalDec.minus(proportionalDiscountDec));
    itemsRefundTotalDec = itemsRefundTotalDec.plus(itemRefundableDec);

    breakdown.push({
      orderItemId: item.orderItemId,
      lineTotal: lineTotalDec.toFixed(2),
      proportionalDiscount: proportionalDiscountDec.toFixed(2),
      refundableAmount: itemRefundableDec.toFixed(2),
    });
  }

  // Shipping refund handling
  let shippingRefundDec = new Decimal(0);
  if (input.includeShipping && shippingTotalDec.greaterThan(0)) {
    shippingRefundDec = shippingTotalDec;
  }

  // Raw calculated total
  const rawTotalRefundDec = itemsRefundTotalDec.plus(shippingRefundDec);

  // Strictly cap at max refundable balance
  const finalTotalRefundDec = Decimal.min(rawTotalRefundDec, maxRefundableDec);

  return {
    totalRefundAmount: finalTotalRefundDec.toFixed(2),
    itemsRefundAmount: itemsRefundTotalDec.toFixed(2),
    shippingRefundAmount: shippingRefundDec.toFixed(2),
    maxRefundableAmount: maxRefundableDec.toFixed(2),
    breakdown,
  };
}
