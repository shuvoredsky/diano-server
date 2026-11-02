import { describe, it, expect } from 'vitest';
import { calculateProportionalReturnRefund } from '@/modules/refunds/refunds.calculator';
import { CouponCalculator } from '@/modules/coupons/coupons.calculator';
import type { CouponEntity } from '@/modules/coupons/coupons.types';

describe('M12 Unit Tests — Shipping, Coupons & Proportional Refunds', () => {
  const couponCalc = new CouponCalculator();

  const baseCoupon: CouponEntity = {
    id: 'coupon-1',
    code: 'SAVE10',
    type: 'PERCENTAGE',
    value: '10.00',
    minPurchase: '1000.00',
    maxDiscount: '200.00',
    startsAt: new Date(Date.now() - 3600000),
    expiresAt: new Date(Date.now() + 86400000),
    usageLimit: 100,
    perUserLimit: 1,
    usedCount: 5,
    firstOrderOnly: false,
    allowOnSale: true,
    scopes: {},
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('1. Proportional Coupon Discount Refund Calculation', () => {
    it('accurately divides coupon discount proportionally across returned items', () => {
      // Order had Subtotal 2000, Coupon discount 200 (10%), Net items paid 1800, Shipping 60, Grand Total 1860
      // Item A: 1200 (60% of subtotal) -> Proportional discount: 120 -> Net refund: 1080
      // Item B: 800 (40% of subtotal) -> Proportional discount: 80 -> Net refund: 720
      const result = calculateProportionalReturnRefund({
        orderSubtotal: '2000.00',
        orderDiscountTotal: '200.00',
        orderShippingTotal: '60.00',
        orderTotalPaid: '1860.00',
        orderTotalRefunded: '0.00',
        returnedItems: [
          { orderItemId: 'item-1', unitPrice: '600.00', quantity: 2, lineTotal: '1200.00' },
        ],
        includeShipping: false,
      });

      expect(result.itemsRefundAmount).toBe('1080.00');
      expect(result.shippingRefundAmount).toBe('0.00');
      expect(result.totalRefundAmount).toBe('1080.00');
      expect(result.breakdown[0]?.proportionalDiscount).toBe('120.00');
      expect(result.breakdown[0]?.refundableAmount).toBe('1080.00');
    });

    it('handles rounding half-up deterministically with odd numbers', () => {
      // Order: Subtotal 1000.00, Discount 100.00 (10%)
      // Item: Line total 333.33 (33.333% of subtotal) -> Proportional discount 33.33 -> Refund 300.00
      const result = calculateProportionalReturnRefund({
        orderSubtotal: '1000.00',
        orderDiscountTotal: '100.00',
        orderShippingTotal: '50.00',
        orderTotalPaid: '950.00',
        orderTotalRefunded: '0.00',
        returnedItems: [
          { orderItemId: 'item-odd', unitPrice: '333.33', quantity: 1, lineTotal: '333.33' },
        ],
      });

      expect(result.breakdown[0]?.proportionalDiscount).toBe('33.33');
      expect(result.breakdown[0]?.refundableAmount).toBe('300.00');
      expect(result.totalRefundAmount).toBe('300.00');
    });

    it('caps refund strictly at maximum refundable balance (paid - already refunded)', () => {
      // Order: Subtotal 2000, Paid 1000 (partial/deposit), Already refunded 800 -> Max refundable: 200
      const result = calculateProportionalReturnRefund({
        orderSubtotal: '2000.00',
        orderDiscountTotal: '0.00',
        orderShippingTotal: '0.00',
        orderTotalPaid: '1000.00',
        orderTotalRefunded: '800.00',
        returnedItems: [
          { orderItemId: 'item-1', unitPrice: '500.00', quantity: 1, lineTotal: '500.00' },
        ],
      });

      expect(result.maxRefundableAmount).toBe('200.00');
      expect(result.itemsRefundAmount).toBe('500.00');
      expect(result.totalRefundAmount).toBe('200.00'); // strictly capped
    });

    it('includes shipping refund when includeShipping is true', () => {
      const result = calculateProportionalReturnRefund({
        orderSubtotal: '1500.00',
        orderDiscountTotal: '150.00',
        orderShippingTotal: '120.00',
        orderTotalPaid: '1470.00',
        orderTotalRefunded: '0.00',
        returnedItems: [
          { orderItemId: 'item-1', unitPrice: '1500.00', quantity: 1, lineTotal: '1500.00' },
        ],
        includeShipping: true,
      });

      expect(result.itemsRefundAmount).toBe('1350.00');
      expect(result.shippingRefundAmount).toBe('120.00');
      expect(result.totalRefundAmount).toBe('1470.00');
    });
  });

  describe('2. Coupon Calculator Rules & Constraints', () => {
    it('applies percentage discount capped by maxDiscount', () => {
      // Subtotal 5000, 10% = 500, maxDiscount 200 -> discount 200.00
      const res = couponCalc.calculateDiscount({
        coupon: baseCoupon,
        items: [{ variantId: 'v1', price: '2500.00', quantity: 2, lineTotal: '5000.00' }],
        subtotal: '5000.00',
        shippingCharge: '60.00',
      });

      expect(res.isValid).toBe(true);
      expect(res.discountAmount).toBe('200.00');
      expect(res.newGrandTotal).toBe('4860.00'); // 5000 - 200 + 60
    });

    it('rejects coupon when minimum purchase threshold is not met', () => {
      const res = couponCalc.calculateDiscount({
        coupon: baseCoupon, // minPurchase: 1000
        items: [{ variantId: 'v1', price: '500.00', quantity: 1, lineTotal: '500.00' }],
        subtotal: '500.00',
      });

      expect(res.isValid).toBe(false);
      expect(res.errorCode).toBe('COUPON_MIN_PURCHASE_NOT_MET');
      expect(res.discountAmount).toBe('0.00');
    });

    it('rejects coupon if expired', () => {
      const expiredCoupon = {
        ...baseCoupon,
        expiresAt: new Date(Date.now() - 60000),
      };

      const res = couponCalc.calculateDiscount({
        coupon: expiredCoupon,
        items: [{ variantId: 'v1', price: '1500.00', quantity: 1, lineTotal: '1500.00' }],
        subtotal: '1500.00',
      });

      expect(res.isValid).toBe(false);
      expect(res.errorCode).toBe('COUPON_EXPIRED');
    });

    it('rejects coupon when per-user usage limit is reached', () => {
      const res = couponCalc.calculateDiscount({
        coupon: baseCoupon, // perUserLimit: 1
        items: [{ variantId: 'v1', price: '1500.00', quantity: 1, lineTotal: '1500.00' }],
        subtotal: '1500.00',
        userCouponUsageCount: 1, // already used 1 time
      });

      expect(res.isValid).toBe(false);
      expect(res.errorCode).toBe('COUPON_USER_LIMIT_EXCEEDED');
    });

    it('excludes on-sale items when allowOnSale is false', () => {
      const noSaleCoupon: CouponEntity = {
        ...baseCoupon,
        allowOnSale: false,
        maxDiscount: null,
      };

      // Cart has 1 full-price item (1000) and 1 on-sale item (1000) -> subtotal 2000
      // 10% should only apply to the 1000 full-price item -> discount 100.00
      const res = couponCalc.calculateDiscount({
        coupon: noSaleCoupon,
        items: [
          { variantId: 'v1', price: '1000.00', quantity: 1, lineTotal: '1000.00', isOnSale: false },
          { variantId: 'v2', price: '1000.00', quantity: 1, lineTotal: '1000.00', isOnSale: true },
        ],
        subtotal: '2000.00',
        shippingCharge: '60.00',
      });

      expect(res.isValid).toBe(true);
      expect(res.eligibleSubtotal).toBe('1000.00');
      expect(res.discountAmount).toBe('100.00');
      expect(res.newGrandTotal).toBe('1960.00'); // 2000 - 100 + 60
    });

    it('rejects coupon when all items in cart are on sale and allowOnSale is false', () => {
      const noSaleCoupon: CouponEntity = {
        ...baseCoupon,
        allowOnSale: false,
      };

      const res = couponCalc.calculateDiscount({
        coupon: noSaleCoupon,
        items: [
          { variantId: 'v1', price: '1000.00', quantity: 1, lineTotal: '1000.00', isOnSale: true },
        ],
        subtotal: '1000.00',
      });

      expect(res.isValid).toBe(false);
      expect(res.errorCode).toBe('COUPON_NOT_APPLICABLE_ON_SALE');
    });

    it('applies fixed discount capped at eligible subtotal so grand total is never negative', () => {
      const fixedCoupon: CouponEntity = {
        ...baseCoupon,
        type: 'FIXED',
        value: '500.00',
        minPurchase: '300.00',
      };

      const res = couponCalc.calculateDiscount({
        coupon: fixedCoupon,
        items: [{ variantId: 'v1', price: '400.00', quantity: 1, lineTotal: '400.00' }],
        subtotal: '400.00',
        shippingCharge: '0.00',
      });

      expect(res.isValid).toBe(true);
      expect(res.discountAmount).toBe('400.00'); // capped at subtotal
      expect(res.newGrandTotal).toBe('0.00'); // not negative
    });

    it('handles FREE_SHIPPING coupon by waiving the shipping charge', () => {
      const freeShipCoupon: CouponEntity = {
        ...baseCoupon,
        type: 'FREE_SHIPPING',
        value: '0.00',
        minPurchase: '500.00',
      };

      const res = couponCalc.calculateDiscount({
        coupon: freeShipCoupon,
        items: [{ variantId: 'v1', price: '800.00', quantity: 1, lineTotal: '800.00' }],
        subtotal: '800.00',
        shippingCharge: '120.00',
      });

      expect(res.isValid).toBe(true);
      expect(res.shippingDiscountAmount).toBe('120.00');
      expect(res.discountAmount).toBe('0.00');
      expect(res.newGrandTotal).toBe('800.00'); // 800 - 0 + 120 - 120
    });
  });
});
