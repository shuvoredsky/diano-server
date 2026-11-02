import { prisma } from '@/config/database';
import Decimal from 'decimal.js';
import type {
  ShippingCalculateParams,
  ShippingCalculationMethodResult,
} from './shipping.types';

export class ShippingCalculator {
  /**
   * Deterministically calculates shipping rates and free shipping rules based on DB configuration
   */
  async calculateMethods(params: ShippingCalculateParams): Promise<ShippingCalculationMethodResult[]> {
    const rawDistrict = params.district?.trim().toLowerCase() || 'dhaka';
    const subtotalDec = params.subtotal ? new Decimal(params.subtotal) : new Decimal(0);
    const weightKg = params.totalWeightKg && params.totalWeightKg > 0 ? params.totalWeightKg : 1;

    // 1. Fetch active zones with active methods
    const zones = await prisma.shippingZone.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        methods: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const parseDistricts = (val: unknown): string[] => {
      if (Array.isArray(val)) return val.map(d => String(d).trim().toLowerCase());
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed.map(d => String(d).trim().toLowerCase());
        } catch {
          return [val.trim().toLowerCase()];
        }
      }
      return [];
    };

    const matchingZones = zones.filter(z => {
      const districts = parseDistricts(z.districts);
      return districts.includes(rawDistrict);
    });

    // Pick most specific zone: smallest district list, then newest
    let matchedZone: typeof zones[number] | undefined;
    if (matchingZones.length > 0) {
      matchedZone = matchingZones.sort((a, b) => {
        const aLen = parseDistricts(a.districts).length;
        const bLen = parseDistricts(b.districts).length;
        if (aLen !== bLen) return aLen - bLen;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })[0];
    }

    // Fallback zone resolution: if no explicit district match, pick 'Outside Dhaka' or first available
    if (!matchedZone && zones.length > 0) {
      matchedZone =
        zones.find(z => z.name.toLowerCase().includes('outside')) ??
        zones.find(z => {
          const list = parseDistricts(z.districts);
          return list.length === 0 || list.includes('*');
        }) ??
        zones[0];
    }

    if (!matchedZone || matchedZone.methods.length === 0) {
      // Deterministic fallback if database has no active methods configured
      const isInside = ['dhaka', 'gazipur', 'narayanganj'].includes(rawDistrict);
      const baseFee = isInside ? '60.00' : '120.00';
      const isFree = subtotalDec.greaterThanOrEqualTo(isInside ? 2000 : 3000);

      return [
        {
          zoneId: isInside ? 'zone-dhaka' : 'zone-outside',
          zoneName: isInside ? 'Inside Dhaka' : 'Outside Dhaka',
          methodId: isInside ? 'method-std-dhaka' : 'method-std-outside',
          methodName: isInside ? 'Standard Home Delivery - Inside Dhaka' : 'Standard Delivery - Outside Dhaka',
          methodCode: isInside ? 'STD-DHK' : 'STD-OUT',
          baseCharge: baseFee,
          calculatedCharge: isFree ? '0.00' : baseFee,
          isFreeShipping: isFree,
          freeShippingReason: isFree ? 'Subtotal threshold met' : undefined,
          estimatedDays: isInside ? '24-48 hours' : '3-5 business days',
        },
      ];
    }

    // 2. Calculate fee for each method in matched zone
    return matchedZone.methods.map(method => {
      const baseChargeDec = new Decimal(method.baseCharge);
      const perKgDec = new Decimal(method.perKgCharge ?? '0.00');

      // Extra weight fee: first 1kg included in base charge
      const extraKg = Math.max(0, weightKg - 1);
      const extraWeightFee = perKgDec.times(extraKg);
      let calculatedChargeDec = baseChargeDec.plus(extraWeightFee);

      let isFreeShipping = false;
      let freeShippingReason: string | undefined;

      // Free shipping rule 1: Product-level free shipping
      if (params.hasFreeShippingProducts) {
        isFreeShipping = true;
        freeShippingReason = 'Free shipping product in cart';
        calculatedChargeDec = new Decimal(0);
      }
      // Free shipping rule 2: Subtotal threshold met
      else if (method.freeShippingThreshold !== null) {
        const thresholdDec = new Decimal(method.freeShippingThreshold);
        if (subtotalDec.greaterThanOrEqualTo(thresholdDec)) {
          isFreeShipping = true;
          freeShippingReason = `Order subtotal exceeds free shipping threshold of ৳${thresholdDec.toFixed(2)}`;
          calculatedChargeDec = new Decimal(0);
        }
      }

      return {
        zoneId: matchedZone!.id,
        zoneName: matchedZone!.name,
        methodId: method.id,
        methodName: method.name,
        methodCode: method.code,
        baseCharge: baseChargeDec.toFixed(2),
        calculatedCharge: calculatedChargeDec.toFixed(2),
        isFreeShipping,
        freeShippingReason,
        estimatedDays: method.estimatedDays,
      };
    });
  }
}

export const shippingCalculator = new ShippingCalculator();
