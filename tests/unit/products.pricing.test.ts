import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculatePricing } from '@/modules/products/products.pricing';
import { AppError } from '@/utils/app-error';

describe('Products Pricing Engine (Unit Tests)', () => {
  describe('calculatePricing with NONE discount', () => {
    it('should return sellingPrice equal to MRP when discountType is NONE', () => {
      const result = calculatePricing({
        mrp: '1500.00',
        discountType: 'NONE',
        discountValue: 0,
      });

      expect(result.mrp.toString()).toBe('1500');
      expect(result.discountType).toBe('NONE');
      expect(result.discountValue.toString()).toBe('0');
      expect(result.discountAmount.toString()).toBe('0');
      expect(result.sellingPrice.toString()).toBe('1500');
    });

    it('should default to discountType NONE if null or omitted', () => {
      const result = calculatePricing({ mrp: 1200 });

      expect(result.discountType).toBe('NONE');
      expect(result.sellingPrice.toString()).toBe('1200');
      expect(result.discountAmount.toString()).toBe('0');
    });

    it('should reject non-zero discount value when discountType is NONE', () => {
      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'NONE',
          discountValue: 100,
        }),
      ).toThrow(AppError);

      try {
        calculatePricing({
          mrp: 1000,
          discountType: 'NONE',
          discountValue: 100,
        });
      } catch (err: unknown) {
        expect((err as AppError).message).toContain('Discount value must be 0 or null when discount type is NONE');
      }
    });
  });

  describe('calculatePricing with PERCENTAGE discount', () => {
    it('should accurately calculate standard percentage discount', () => {
      const result = calculatePricing({
        mrp: '2000.00',
        discountType: 'PERCENTAGE',
        discountValue: '15',
      });

      // 2000 * 15% = 300 discount -> 1700 sellingPrice
      expect(result.discountAmount.toString()).toBe('300');
      expect(result.sellingPrice.toString()).toBe('1700');
    });

    it('should perform ROUND_HALF_UP rounding to 2 decimal places for fractional percentage discounts', () => {
      // 1000 * 12.345% = 123.45 discount -> 876.55 sellingPrice
      const result1 = calculatePricing({
        mrp: '1000.00',
        discountType: 'PERCENTAGE',
        discountValue: '12.345',
      });
      expect(result1.discountAmount.toString()).toBe('123.45');
      expect(result1.sellingPrice.toString()).toBe('876.55');

      // 199.99 * 33.33% = 66.656667 -> rounds to 66.66 discount -> 133.33 sellingPrice
      const result2 = calculatePricing({
        mrp: '199.99',
        discountType: 'PERCENTAGE',
        discountValue: '33.33',
      });
      expect(result2.discountAmount.toString()).toBe('66.66');
      expect(result2.sellingPrice.toString()).toBe('133.33');
    });

    it('should reject percentage discount <= 0', () => {
      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'PERCENTAGE',
          discountValue: 0,
        }),
      ).toThrow('Percentage discount must be greater than 0%');

      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'PERCENTAGE',
          discountValue: -5,
        }),
      ).toThrow('Percentage discount must be greater than 0%');
    });

    it('should reject percentage discount >= 100%', () => {
      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'PERCENTAGE',
          discountValue: 100,
        }),
      ).toThrow('strictly less than 100%');

      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'PERCENTAGE',
          discountValue: 105,
        }),
      ).toThrow('strictly less than 100%');
    });
  });

  describe('calculatePricing with FIXED discount', () => {
    it('should accurately calculate fixed BDT discount', () => {
      const result = calculatePricing({
        mrp: '1500.00',
        discountType: 'FIXED',
        discountValue: '250.00',
      });

      expect(result.discountAmount.toString()).toBe('250');
      expect(result.sellingPrice.toString()).toBe('1250');
    });

    it('should reject fixed discount <= 0', () => {
      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'FIXED',
          discountValue: 0,
        }),
      ).toThrow('Fixed discount value must be greater than 0');

      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'FIXED',
          discountValue: -50,
        }),
      ).toThrow('Fixed discount value must be greater than 0');
    });

    it('should reject fixed discount >= MRP', () => {
      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'FIXED',
          discountValue: 1000,
        }),
      ).toThrow('strictly less than MRP');

      expect(() =>
        calculatePricing({
          mrp: 1000,
          discountType: 'FIXED',
          discountValue: 1200,
        }),
      ).toThrow('strictly less than MRP');
    });
  });

  describe('Validation & Edge Cases', () => {
    it('should reject non-positive MRP', () => {
      expect(() =>
        calculatePricing({
          mrp: 0,
        }),
      ).toThrow('MRP must be greater than zero');

      expect(() =>
        calculatePricing({
          mrp: -100,
        }),
      ).toThrow('MRP must be greater than zero');
    });

    it('should strictly ignore client-provided sellingPrice', () => {
      const result = calculatePricing({
        mrp: '1000.00',
        discountType: 'PERCENTAGE',
        discountValue: '20',
        sellingPrice: '50.00', // Fraudulent/manipulated client price
      });

      // Server calculates: 1000 - 200 = 800; ignores client's 50
      expect(result.sellingPrice.toString()).toBe('800');
      expect(result.discountAmount.toString()).toBe('200');
    });

    it('should generate non-blocking warning when sellingPrice is less than costPrice', () => {
      const result = calculatePricing({
        mrp: '1000.00',
        discountType: 'PERCENTAGE',
        discountValue: '50', // sellingPrice = 500
        costPrice: '600.00', // costPrice > sellingPrice
      });

      expect(result.sellingPrice.toString()).toBe('500');
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBe(1);
      expect(result.warnings?.[0]).toContain('less than unit cost price');
    });

    it('should NOT generate warning when sellingPrice is greater than or equal to costPrice', () => {
      const result = calculatePricing({
        mrp: '1000.00',
        discountType: 'PERCENTAGE',
        discountValue: '20', // sellingPrice = 800
        costPrice: '600.00',
      });

      expect(result.sellingPrice.toString()).toBe('800');
      expect(result.warnings).toBeUndefined();
    });

    it('should accept Decimal instances directly as arguments', () => {
      const result = calculatePricing({
        mrp: new Decimal(2500),
        discountType: 'FIXED',
        discountValue: new Decimal(500),
      });

      expect(result.sellingPrice.equals(new Decimal(2000))).toBe(true);
      expect(result.discountAmount.equals(new Decimal(500))).toBe(true);
    });
  });
});
