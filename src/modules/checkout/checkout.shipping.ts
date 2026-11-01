import { prisma } from '@/config/database';
import { toMoneyString, toNumberSafe } from '@/utils/currency.util';

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
  }): Promise<ShippingCalculationResult>;
}

export class DatabaseShippingCalculator implements IShippingCalculator {
  async calculateShipping(params: {
    district?: string;
    deliveryMethodCode?: string;
  }): Promise<ShippingCalculationResult> {
    const rawDistrict = params.district?.trim().toLowerCase() || 'dhaka';

    try {
      // Find matching shipping zone in database
      const zones = await prisma.shippingZone.findMany({
        where: { isActive: true },
        include: {
          methods: {
            where: { isActive: true },
          },
        },
      });

      for (const zone of zones) {
        const districtsList = Array.isArray(zone.districts)
          ? (zone.districts as string[]).map(d => d.toLowerCase())
          : [];

        if (districtsList.includes(rawDistrict)) {
          const selectedMethod = params.deliveryMethodCode
            ? zone.methods.find(m => m.code === params.deliveryMethodCode) || zone.methods[0]
            : zone.methods[0];

          if (selectedMethod) {
            return {
              shippingCharge: toMoneyString(toNumberSafe(selectedMethod.baseCharge)),
              zoneName: zone.name,
              methodName: selectedMethod.name,
              methodCode: selectedMethod.code,
              estimatedDays: selectedMethod.estimatedDays,
            };
          }
        }
      }
    } catch {
      // Database not connected or empty, proceed to deterministic seed defaults
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
