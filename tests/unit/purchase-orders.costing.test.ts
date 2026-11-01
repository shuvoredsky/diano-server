import { describe, it, expect } from 'vitest';
import { calculateWeightedAverageCost } from '@/modules/purchase-orders/purchase-orders.costing';

describe('Weighted Average Cost Calculation (Pure Function)', () => {
  it('should calculate weighted average correctly for standard inbound shipment', () => {
    // 10 units @ 100 BDT + 10 units @ 120 BDT = 20 units @ 110 BDT
    const cost = calculateWeightedAverageCost(10, 100, 10, 120);
    expect(cost).toBe(110);
  });

  it('should weight according to quantities properly', () => {
    // 100 units @ 50 BDT (5000) + 25 units @ 100 BDT (2500) = 7500 / 125 = 60 BDT
    const cost = calculateWeightedAverageCost(100, 50, 25, 100);
    expect(cost).toBe(60);
  });

  it('should use incoming unit cost when current on-hand is zero', () => {
    // Zero prior inventory: new cost is exactly the PO unit cost
    const cost = calculateWeightedAverageCost(0, 0, 50, 85.5);
    expect(cost).toBe(85.5);
  });

  it('should use incoming unit cost when current on-hand or cost is negative (safety boundary)', () => {
    const cost = calculateWeightedAverageCost(-5, 100, 20, 95);
    expect(cost).toBe(95);

    const costNegativePriorCost = calculateWeightedAverageCost(10, -10, 10, 50);
    expect(costNegativePriorCost).toBe(50);
  });

  it('should preserve existing cost price if received quantity is zero or negative', () => {
    const cost = calculateWeightedAverageCost(20, 150, 0, 200);
    expect(cost).toBe(150);

    const costNegativeQty = calculateWeightedAverageCost(20, 150, -5, 200);
    expect(costNegativeQty).toBe(150);
  });

  it('should accurately round to two decimal places for fractional costs', () => {
    // 3 units @ 10.33 + 7 units @ 15.67 = 30.99 + 109.69 = 140.68 / 10 = 14.068 -> 14.07
    const cost = calculateWeightedAverageCost(3, 10.33, 7, 15.67);
    expect(cost).toBe(14.07);
  });
});
