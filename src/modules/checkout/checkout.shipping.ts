import { shippingCalculator } from '@/modules/shipping/shipping.calculator';

export interface ShippingCalculationResult {
  shippingCharge: string;
  zoneName: string;
  methodName: string;
  methodCode: string;
  estimatedDays: string;
}

export interface IShippingCalculator {
  calculateShipping(params: {
    district?: string;
    deliveryMethodCode?: string;
    subtotal?: string;
    hasFreeShippingProducts?: boolean;
    totalWeightKg?: number;
  }): Promise<ShippingCalculationResult>;
}

export class DatabaseShippingCalculator implements IShippingCalculator {
  async calculateShipping(params: {
    district?: string;
    deliveryMethodCode?: string;
    subtotal?: string;
    hasFreeShippingProducts?: boolean;
    totalWeightKg?: number;
  }): Promise<ShippingCalculationResult> {
    const rawDistrict = params.district?.trim().toLowerCase() || 'dhaka';
    try {
      const methods = await shippingCalculator.calculateMethods({
        district: params.district,
        deliveryMethodCode: params.deliveryMethodCode,
        subtotal: params.subtotal,
        hasFreeShippingProducts: params.hasFreeShippingProducts,
        totalWeightKg: params.totalWeightKg,
      });

      const selected = params.deliveryMethodCode
        ? methods.find(m => m.methodCode === params.deliveryMethodCode) || methods[0]
        : methods[0];

      if (selected) {
        return {
          shippingCharge: selected.calculatedCharge,
          zoneName: selected.zoneName,
          methodName: selected.methodName,
          methodCode: selected.methodCode,
          estimatedDays: selected.estimatedDays,
        };
      }
    } catch {
      // Fallback
    }

    // Default business rules (Inside Dhaka = 60 BDT, Outside Dhaka = 120 BDT)
    const isInsideDhaka = ['dhaka', 'gazipur', 'narayanganj'].includes(rawDistrict);

    if (isInsideDhaka) {
      return {
        shippingCharge: '60.00',
        zoneName: 'Inside Dhaka',
        methodName: 'Standard Home Delivery - Inside Dhaka',
        methodCode: 'STD-DHK',
        estimatedDays: '24-48 hours',
      };
    }

    return {
      shippingCharge: '120.00',
      zoneName: 'Outside Dhaka',
      methodName: 'Courier Delivery - Outside Dhaka',
      methodCode: 'STD-OUT',
      estimatedDays: '2-4 days',
    };
  }
}

export const defaultShippingCalculator = new DatabaseShippingCalculator();
