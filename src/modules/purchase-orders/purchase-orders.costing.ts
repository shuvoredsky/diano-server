/**
 * Pure function: Calculate Weighted Average Cost
 * 
 * Formula:
 * New Cost = ((Current On-Hand * Current Cost Price) + (Received Quantity * Unit Cost)) / (Current On-Hand + Received Quantity)
 * 
 * Rules:
 * 1. If current on-hand <= 0 or current cost price <= 0, the new cost price is strictly the unitCost of incoming goods.
 * 2. If received quantity <= 0, the existing cost price is retained.
 * 3. Rounded to 2 decimal places.
 */
export function calculateWeightedAverageCost(
  currentOnHand: number,
  currentCostPrice: number,
  receivedQty: number,
  unitCost: number,
): number {
  if (receivedQty <= 0) {
    return Number(Math.max(0, currentCostPrice).toFixed(2));
  }

  if (currentOnHand <= 0 || currentCostPrice <= 0) {
    return Number(Math.max(0, unitCost).toFixed(2));
  }

  const existingTotalValue = currentOnHand * currentCostPrice;
  const incomingTotalValue = receivedQty * unitCost;
  const totalUnits = currentOnHand + receivedQty;

  const weightedAverage = (existingTotalValue + incomingTotalValue) / totalUnits;
  return Number(weightedAverage.toFixed(2));
}
