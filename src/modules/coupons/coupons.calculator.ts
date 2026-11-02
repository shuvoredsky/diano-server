import Decimal from 'decimal.js';
import type {
  CouponCalculateInput,
  CouponDiscountResult,
  CouponEntity,
} from './coupons.types';

export class CouponCalculator {
  /**
   * Pure calculation function for coupon evaluation with rigorous business constraints:
   * - Discount <= eligible subtotal
   * - Grand total >= 0
   * - Single coupon per order
   * - Disallows on-sale items if allowOnSale: false
   * - Usage limits and dates checked
   */
  calculateDiscount(input: CouponCalculateInput): CouponDiscountResult {
    const { coupon, items, subtotal } = input;
    const now = input.now || new Date();
    const subtotalDec = new Decimal(subtotal);
    const shippingChargeDec = new Decimal(input.shippingCharge || '0.00');

    // 1. Active & soft-delete check
    if (!coupon.isActive || coupon.deletedAt) {
      return this.invalidResult(coupon, 'This coupon is no longer active', 'COUPON_INACTIVE', subtotalDec, shippingChargeDec);
    }

    // 2. Date validity window
    if (now < new Date(coupon.startsAt)) {
      return this.invalidResult(coupon, 'This coupon promotion has not started yet', 'COUPON_NOT_STARTED', subtotalDec, shippingChargeDec);
    }
    if (now > new Date(coupon.expiresAt)) {
      return this.invalidResult(coupon, 'This coupon has expired', 'COUPON_EXPIRED', subtotalDec, shippingChargeDec);
    }

    // 3. Global usage limit
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return this.invalidResult(coupon, 'Coupon total usage limit has been reached', 'COUPON_USAGE_LIMIT_EXCEEDED', subtotalDec, shippingChargeDec);
    }

    // 4. Per-user usage limit
    if (input.userCouponUsageCount !== undefined && input.userCouponUsageCount >= coupon.perUserLimit) {
      return this.invalidResult(coupon, `You have already used this coupon the maximum allowed times (${coupon.perUserLimit})`, 'COUPON_USER_LIMIT_EXCEEDED', subtotalDec, shippingChargeDec);
    }

    // 5. First order only check
    if (coupon.firstOrderOnly && (input.userPriorOrderCount ?? 0) > 0) {
      return this.invalidResult(coupon, 'This coupon is only valid for your first order', 'COUPON_FIRST_ORDER_ONLY', subtotalDec, shippingChargeDec);
    }

    // 6. Minimum purchase check
    const minPurchaseDec = new Decimal(coupon.minPurchase);
    if (subtotalDec.lessThan(minPurchaseDec)) {
      return this.invalidResult(
        coupon,
        `Minimum order amount of ৳${minPurchaseDec.toFixed(2)} required to use this coupon`,
        'COUPON_MIN_PURCHASE_NOT_MET',
        subtotalDec,
        shippingChargeDec,
      );
    }

    // 7. Calculate eligible subtotal (filter on-sale items if allowOnSale: false)
    let eligibleSubtotalDec = new Decimal(0);
    if (!coupon.allowOnSale) {
      for (const item of items) {
        if (!item.isOnSale) {
          eligibleSubtotalDec = eligibleSubtotalDec.plus(new Decimal(item.lineTotal));
        }
      }
      if (eligibleSubtotalDec.isZero()) {
        return this.invalidResult(
          coupon,
          'Coupon is not applicable because all items in the cart are on sale',
          'COUPON_NOT_APPLICABLE_ON_SALE',
          subtotalDec,
          shippingChargeDec,
        );
      }
    } else {
      eligibleSubtotalDec = subtotalDec;
    }

    // 8. Compute discount amount based on type
    let discountDec = new Decimal(0);
    let shippingDiscountDec = new Decimal(0);

    if (coupon.type === 'PERCENTAGE') {
      const percentageDec = new Decimal(coupon.value);
      discountDec = eligibleSubtotalDec.times(percentageDec).dividedBy(100);

      // Max discount cap if configured
      if (coupon.maxDiscount !== null) {
        const maxDiscountDec = new Decimal(coupon.maxDiscount);
        if (discountDec.greaterThan(maxDiscountDec)) {
          discountDec = maxDiscountDec;
        }
      }

      // Ensure discount does not exceed eligible subtotal
      if (discountDec.greaterThan(eligibleSubtotalDec)) {
        discountDec = eligibleSubtotalDec;
      }
    } else if (coupon.type === 'FIXED') {
      const fixedValueDec = new Decimal(coupon.value);
      // Fixed discount capped at eligible subtotal
      discountDec = Decimal.min(fixedValueDec, eligibleSubtotalDec);
    } else if (coupon.type === 'FREE_SHIPPING') {
      // Free shipping waives the shipping fee
      shippingDiscountDec = shippingChargeDec;
    }

    // Grand total calculation: subtotal - discount + shipping - shippingDiscount
    let newGrandTotalDec = subtotalDec
      .minus(discountDec)
      .plus(shippingChargeDec)
      .minus(shippingDiscountDec);

    if (newGrandTotalDec.isNegative()) {
      newGrandTotalDec = new Decimal(0);
    }

    return {
      isValid: true,
      couponId: coupon.id,
      couponCode: coupon.code,
      type: coupon.type,
      discountAmount: discountDec.toFixed(2),
      shippingDiscountAmount: shippingDiscountDec.toFixed(2),
      eligibleSubtotal: eligibleSubtotalDec.toFixed(2),
      newGrandTotal: newGrandTotalDec.toFixed(2),
    };
  }

  private invalidResult(
    coupon: CouponEntity,
    error: string,
    errorCode: string,
    subtotal: Decimal,
    shippingCharge: Decimal,
  ): CouponDiscountResult {
    return {
      isValid: false,
      couponId: coupon.id,
      couponCode: coupon.code,
      type: coupon.type,
      discountAmount: '0.00',
      shippingDiscountAmount: '0.00',
      eligibleSubtotal: '0.00',
      newGrandTotal: subtotal.plus(shippingCharge).toFixed(2),
      error,
      errorCode,
    };
  }
}

export const couponCalculator = new CouponCalculator();
