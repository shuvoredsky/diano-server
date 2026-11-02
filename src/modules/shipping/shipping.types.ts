import type { ShipmentStatus } from '@prisma/client';

export interface ShippingZoneEntity {
  id: string;
  name: string;
  districts: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  methods?: ShippingMethodEntity[];
}

export interface ShippingMethodEntity {
  id: string;
  shippingZoneId: string;
  name: string;
  code: string;
  baseCharge: string;
  perKgCharge: string;
  freeShippingThreshold: string | null;
  estimatedDays: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentEntity {
  id: string;
  orderId: string;
  shippingMethodId: string | null;
  courierName: string;
  trackingNumber: string | null;
  status: ShipmentStatus;
  labelUrl: string | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  events?: ShipmentEventEntity[];
  attempts?: DeliveryAttemptEntity[];
}

export interface ShipmentEventEntity {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  location: string | null;
  description: string;
  occurredAt: Date;
  createdAt: Date;
}

export interface DeliveryAttemptEntity {
  id: string;
  shipmentId: string;
  attemptNumber: number;
  status: string;
  reason: string | null;
  attemptedAt: Date;
  createdAt: Date;
}

export interface ShippingCalculateParams {
  district?: string;
  totalWeightKg?: number;
  subtotal?: string;
  hasFreeShippingProducts?: boolean;
  deliveryMethodCode?: string;
}

export interface ShippingCalculationMethodResult {
  zoneId: string;
  zoneName: string;
  methodId: string;
  methodName: string;
  methodCode: string;
  baseCharge: string;
  calculatedCharge: string;
  isFreeShipping: boolean;
  freeShippingReason?: string;
  estimatedDays: string;
}

export interface CreateShippingZoneInput {
  name: string;
  districts: string[];
  isActive?: boolean;
}

export interface UpdateShippingZoneInput {
  name?: string;
  districts?: string[];
  isActive?: boolean;
}

export interface CreateShippingMethodInput {
  shippingZoneId: string;
  name: string;
  code: string;
  baseCharge: string | number;
  perKgCharge?: string | number;
  freeShippingThreshold?: string | number | null;
  estimatedDays: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateShippingMethodInput {
  shippingZoneId?: string;
  name?: string;
  code?: string;
  baseCharge?: string | number;
  perKgCharge?: string | number;
  freeShippingThreshold?: string | number | null;
  estimatedDays?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateOrderShipmentInput {
  shippingMethodId?: string;
  courierName: string;
  trackingNumber?: string;
  status?: ShipmentStatus;
  labelUrl?: string;
  notes?: string;
}

export interface UpdateShipmentStatusInput {
  status: ShipmentStatus;
  location?: string;
  note?: string;
}

export interface CourierCreateShipmentResult {
  trackingNumber: string;
  labelUrl?: string;
}

export interface CourierTrackResult {
  status: ShipmentStatus;
  events: Array<{
    status: ShipmentStatus;
    location?: string;
    description: string;
    occurredAt: Date;
  }>;
}

export interface CourierAdapter {
  readonly name: string;
  createShipment(data: {
    orderId: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    district: string;
    codAmount: number;
    notes?: string;
  }): Promise<CourierCreateShipmentResult>;
  trackShipment(trackingNumber: string): Promise<CourierTrackResult>;
  cancelShipment(trackingNumber: string): Promise<boolean>;
}
