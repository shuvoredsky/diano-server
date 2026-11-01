export interface CouponCalculationResult {
  discount: string;
  couponCode?: string;
  couponId?: string;
}

export interface ICouponCalculator {
  calculateDiscount(params: {
    couponCode?: string;
    subtotal: string;
    userId?: string | null;
  }): Promise<CouponCalculationResult>;
}

export class DefaultCouponCalculator implements ICouponCalculator {
  async calculateDiscount(): Promise<CouponCalculationResult> {
    return {
      discount: '0.00',
    };
  }
}

export const defaultCouponCalculator = new DefaultCouponCalculator();
