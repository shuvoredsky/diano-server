import { prisma } from '@/config/database';
import type { Prisma, ShipmentStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import type {
  ShippingZoneEntity,
  ShippingMethodEntity,
  ShipmentEntity,
  CreateShippingZoneInput,
  UpdateShippingZoneInput,
  CreateShippingMethodInput,
  UpdateShippingMethodInput,
} from './shipping.types';

export class ShippingRepository {
  // ==========================================
  // SHIPPING ZONES
  // ==========================================

  async listZones(): Promise<ShippingZoneEntity[]> {
    const rows = await prisma.shippingZone.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        methods: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      districts: Array.isArray(r.districts) ? (r.districts as string[]) : [],
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      methods: r.methods.map(m => this.formatMethod(m)),
    }));
  }

  async findZoneById(id: string): Promise<ShippingZoneEntity | null> {
    const r = await prisma.shippingZone.findUnique({
      where: { id },
      include: {
        methods: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!r) return null;

    return {
      id: r.id,
      name: r.name,
      districts: Array.isArray(r.districts) ? (r.districts as string[]) : [],
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      methods: r.methods.map(m => this.formatMethod(m)),
    };
  }

  async createZone(input: CreateShippingZoneInput): Promise<ShippingZoneEntity> {
    const r = await prisma.shippingZone.create({
      data: {
        name: input.name,
        districts: input.districts as unknown as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
      include: { methods: true },
    });

    return {
      id: r.id,
      name: r.name,
      districts: Array.isArray(r.districts) ? (r.districts as string[]) : [],
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      methods: [],
    };
  }

  async updateZone(id: string, input: UpdateShippingZoneInput): Promise<ShippingZoneEntity> {
    const data: Prisma.ShippingZoneUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.districts !== undefined) {
      data.districts = input.districts as unknown as Prisma.InputJsonValue;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const r = await prisma.shippingZone.update({
      where: { id },
      data,
      include: { methods: true },
    });

    return {
      id: r.id,
      name: r.name,
      districts: Array.isArray(r.districts) ? (r.districts as string[]) : [],
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      methods: r.methods.map(m => this.formatMethod(m)),
    };
  }

  async deleteZone(id: string): Promise<void> {
    await prisma.shippingZone.delete({
      where: { id },
    });
  }

  // ==========================================
  // SHIPPING METHODS
  // ==========================================

  private formatMethod(m: {
    id: string;
    shippingZoneId: string;
    name: string;
    code: string;
    baseCharge: { toString(): string };
    perKgCharge: { toString(): string };
    freeShippingThreshold: { toString(): string } | null;
    estimatedDays: string;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ShippingMethodEntity {
    return {
      id: m.id,
      shippingZoneId: m.shippingZoneId,
      name: m.name,
      code: m.code,
      baseCharge: new Decimal(m.baseCharge.toString()).toFixed(2),
      perKgCharge: new Decimal(m.perKgCharge.toString()).toFixed(2),
      freeShippingThreshold: m.freeShippingThreshold
        ? new Decimal(m.freeShippingThreshold.toString()).toFixed(2)
        : null,
      estimatedDays: m.estimatedDays,
      sortOrder: m.sortOrder,
      isActive: m.isActive,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  async listMethods(zoneId?: string): Promise<ShippingMethodEntity[]> {
    const where: Prisma.ShippingMethodWhereInput = {};
    if (zoneId) where.shippingZoneId = zoneId;

    const rows = await prisma.shippingMethod.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    return rows.map(r => this.formatMethod(r));
  }

  async findMethodById(id: string): Promise<ShippingMethodEntity | null> {
    const r = await prisma.shippingMethod.findUnique({
      where: { id },
    });
    return r ? this.formatMethod(r) : null;
  }

  async findMethodByCode(code: string): Promise<ShippingMethodEntity | null> {
    const r = await prisma.shippingMethod.findUnique({
      where: { code },
    });
    return r ? this.formatMethod(r) : null;
  }

  async createMethod(input: CreateShippingMethodInput): Promise<ShippingMethodEntity> {
    const r = await prisma.shippingMethod.create({
      data: {
        shippingZoneId: input.shippingZoneId,
        name: input.name,
        code: input.code.trim().toUpperCase(),
        baseCharge: input.baseCharge.toString(),
        perKgCharge: (input.perKgCharge ?? 0).toString(),
        freeShippingThreshold: input.freeShippingThreshold !== undefined && input.freeShippingThreshold !== null
          ? input.freeShippingThreshold.toString()
          : null,
        estimatedDays: input.estimatedDays,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });

    return this.formatMethod(r);
  }

  async updateMethod(id: string, input: UpdateShippingMethodInput): Promise<ShippingMethodEntity> {
    const data: Prisma.ShippingMethodUpdateInput = {};
    if (input.shippingZoneId !== undefined) data.shippingZone = { connect: { id: input.shippingZoneId } };
    if (input.name !== undefined) data.name = input.name;
    if (input.code !== undefined) data.code = input.code.trim().toUpperCase();
    if (input.baseCharge !== undefined) data.baseCharge = input.baseCharge.toString();
    if (input.perKgCharge !== undefined) data.perKgCharge = input.perKgCharge.toString();
    if (input.freeShippingThreshold !== undefined) {
      data.freeShippingThreshold = input.freeShippingThreshold !== null
        ? input.freeShippingThreshold.toString()
        : null;
    }
    if (input.estimatedDays !== undefined) data.estimatedDays = input.estimatedDays;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const r = await prisma.shippingMethod.update({
      where: { id },
      data,
    });

    return this.formatMethod(r);
  }

  async deleteMethod(id: string): Promise<void> {
    await prisma.shippingMethod.delete({
      where: { id },
    });
  }

  // ==========================================
  // SHIPMENTS
  // ==========================================

  formatShipment(row: {
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
    events?: Array<{
      id: string;
      shipmentId: string;
      status: ShipmentStatus;
      location: string | null;
      description: string;
      occurredAt: Date;
      createdAt: Date;
    }>;
    attempts?: Array<{
      id: string;
      shipmentId: string;
      attemptNumber: number;
      status: string;
      reason: string | null;
      attemptedAt: Date;
      createdAt: Date;
    }>;
  }): ShipmentEntity {
    return {
      id: row.id,
      orderId: row.orderId,
      shippingMethodId: row.shippingMethodId,
      courierName: row.courierName,
      trackingNumber: row.trackingNumber,
      status: row.status,
      labelUrl: row.labelUrl,
      dispatchedAt: row.dispatchedAt,
      deliveredAt: row.deliveredAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      events: row.events?.map(e => ({
        id: e.id,
        shipmentId: e.shipmentId,
        status: e.status,
        location: e.location,
        description: e.description,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      })),
      attempts: row.attempts?.map(a => ({
        id: a.id,
        shipmentId: a.shipmentId,
        attemptNumber: a.attemptNumber,
        status: a.status,
        reason: a.reason,
        attemptedAt: a.attemptedAt,
        createdAt: a.createdAt,
      })),
    };
  }

  async findShipmentByOrderId(orderId: string): Promise<ShipmentEntity | null> {
    const r = await prisma.shipment.findUnique({
      where: { orderId },
      include: {
        events: { orderBy: { occurredAt: 'desc' } },
        attempts: { orderBy: { attemptNumber: 'desc' } },
      },
    });
    return r ? this.formatShipment(r) : null;
  }

  async findShipmentById(id: string): Promise<ShipmentEntity | null> {
    const r = await prisma.shipment.findUnique({
      where: { id },
      include: {
        events: { orderBy: { occurredAt: 'desc' } },
        attempts: { orderBy: { attemptNumber: 'desc' } },
      },
    });
    return r ? this.formatShipment(r) : null;
  }

  async createShipment(data: {
    orderId: string;
    shippingMethodId?: string;
    courierName: string;
    trackingNumber?: string;
    status?: ShipmentStatus;
    labelUrl?: string;
    dispatchedAt?: Date;
  }): Promise<ShipmentEntity> {
    const r = await prisma.shipment.create({
      data: {
        orderId: data.orderId,
        shippingMethodId: data.shippingMethodId ?? null,
        courierName: data.courierName,
        trackingNumber: data.trackingNumber ?? null,
        status: data.status ?? 'PENDING',
        labelUrl: data.labelUrl ?? null,
        dispatchedAt: data.dispatchedAt ?? null,
      },
      include: {
        events: true,
        attempts: true,
      },
    });

    return this.formatShipment(r);
  }

  async updateShipment(
    id: string,
    data: Prisma.ShipmentUpdateInput,
  ): Promise<ShipmentEntity> {
    const r = await prisma.shipment.update({
      where: { id },
      data,
      include: {
        events: { orderBy: { occurredAt: 'desc' } },
        attempts: { orderBy: { attemptNumber: 'desc' } },
      },
    });

    return this.formatShipment(r);
  }

  async addShipmentEvent(data: {
    shipmentId: string;
    status: ShipmentStatus;
    location?: string;
    description: string;
    occurredAt?: Date;
  }): Promise<void> {
    await prisma.shipmentEvent.create({
      data: {
        shipmentId: data.shipmentId,
        status: data.status,
        location: data.location ?? null,
        description: data.description,
        occurredAt: data.occurredAt ?? new Date(),
      },
    });
  }

  async addDeliveryAttempt(data: {
    shipmentId: string;
    attemptNumber: number;
    status: string;
    reason?: string;
    attemptedAt?: Date;
  }): Promise<void> {
    await prisma.deliveryAttempt.create({
      data: {
        shipmentId: data.shipmentId,
        attemptNumber: data.attemptNumber,
        status: data.status,
        reason: data.reason ?? null,
        attemptedAt: data.attemptedAt ?? new Date(),
      },
    });
  }
}

export const shippingRepository = new ShippingRepository();
