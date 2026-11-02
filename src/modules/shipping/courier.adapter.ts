import crypto from 'crypto';
import type { CourierAdapter, CourierCreateShipmentResult, CourierTrackResult } from './shipping.types';

export class ManualCourierAdapter implements CourierAdapter {
  readonly name = 'MANUAL';

  async createShipment(data: {
    orderId: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    district: string;
    codAmount: number;
    notes?: string;
  }): Promise<CourierCreateShipmentResult> {
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const trackingNumber = `TRK-MAN-${Date.now().toString().slice(-6)}-${randomSuffix}`;

    return {
      trackingNumber,
      labelUrl: `/api/v1/shipments/labels/${data.orderId}`,
    };
  }

  async trackShipment(trackingNumber: string): Promise<CourierTrackResult> {
    return {
      status: 'IN_TRANSIT',
      events: [
        {
          status: 'PICKED_UP',
          description: 'Package picked up from warehouse by manual delivery agent',
          location: 'Dhaka Central Hub',
          occurredAt: new Date(Date.now() - 3600000),
        },
        {
          status: 'IN_TRANSIT',
          description: `Package in transit with tracking ID ${trackingNumber}`,
          location: 'In Transit',
          occurredAt: new Date(),
        },
      ],
    };
  }

  async cancelShipment(_trackingNumber: string): Promise<boolean> {
    return true;
  }
}

export const manualCourierAdapter = new ManualCourierAdapter();
