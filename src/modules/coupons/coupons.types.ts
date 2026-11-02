import type { CouponType } from '@prisma/client';

export interface CouponEntity {
  id: string;
  code: string;
  type: CouponType;
  value: string;
  minPurchase: string;
  maxDiscount: string | null;
  startsAt: Date;
  expiresAt: Date;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  firstOrderOnly: boolean;
  allowOnSale: boolean;
  scopes: unknown;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponItemContext {
  variantId: string;
  price: string;
  quantity: number;
  lineTotal: string;
  isOnSale?: boolean;
}

export interface CouponCalculateInput {
  coupon: CouponEntity;
  items: CouponItemContext[];
  subtotal: string;
  shippingCharge?: string;
  userId?: string | null;
  userPriorOrderCount?: number;
  userCouponUsageCount?: number;
  now?: Date;
}

export interface CouponDiscountResult {
  isValid: boolean;
  couponId: string;
  couponCode: string;
  type: CouponType;
  discountAmount: string;
  shippingDiscountAmount: string;
  eligibleSubtotal: string;
  newGrandTotal: string;
  error?: string;
  errorCode?: string;
}

export interface CreateCouponInput {
  code: string;
  type: CouponType;
  value: string | number;
  minPurchase?: string | number;
  maxDiscount?: string | number | null;
  startsAt: Date | string;
  expiresAt: Date | string;
  usageLimit?: number | null;
  perUserLimit?: number;
  firstOrderOnly?: boolean;
  allowOnSale?: boolean;
  scopes?: unknown;
  isActive?: boolean;
}

export interface UpdateCouponInput {
  code?: string;
  type?: CouponType;
  value?: string | number;
  minPurchase?: string | number;
  maxDiscount?: string | number | null;
  startsAt?: Date | string;
  expiresAt?: Date | string;
  usageLimit?: number | null;
  perUserLimit?: number;
  firstOrderOnly?: boolean;
  allowOnSale?: boolean;
  scopes?: unknown;
  isActive?: boolean;
}

export interface CouponFilter {
  search?: string;
  isActive?: boolean;
  type?: CouponType;
  page?: number;
  limit?: number;
}

export interface FlashSaleEntity {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  items?: FlashSaleItemEntity[];
}

export interface FlashSaleItemEntity {
  id: string;
  flashSaleId: string;
  variantId: string;
  discountPrice: string;
  stockLimit: number;
  soldCount: number;
}

export interface CreateFlashSaleInput {
  title: string;
  description?: string;
  startsAt: Date | string;
  endsAt: Date | string;
  isActive?: boolean;
  items: Array<{
    variantId: string;
    discountPrice: string | number;
    stockLimit: number;
  }>;
}
