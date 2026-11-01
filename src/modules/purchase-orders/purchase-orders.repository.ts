import { prisma } from '@/config/database';
import type {
  IPurchaseOrdersRepository,
  PurchaseOrderEntity,
  PurchaseOrderItemEntity,
  PurchaseOrderFilterQuery,
  CreatePoItemInput,
} from './purchase-orders.types';
import type { Prisma, PurchaseOrderStatus } from '@prisma/client';

export class PurchaseOrdersRepository implements IPurchaseOrdersRepository {
  private mapItem(item: {
    id: string;
    purchaseOrderId: string;
    variantId: string;
    orderedQuantity: number;
    receivedQuantity: number;
    unitCost: { toNumber(): number } | number;
    lineTotal: { toNumber(): number } | number;
    createdAt: Date;
    updatedAt: Date;
    variant?: {
      id: string;
      sku: string;
      name: string;
      costPrice: { toNumber(): number } | number | null;
    };
  }): PurchaseOrderItemEntity {
    return {
      ...item,
      unitCost: typeof item.unitCost === 'number' ? item.unitCost : item.unitCost.toNumber(),
      lineTotal: typeof item.lineTotal === 'number' ? item.lineTotal : item.lineTotal.toNumber(),
      variant: item.variant
        ? {
            ...item.variant,
            costPrice:
              item.variant.costPrice === null
                ? null
                : typeof item.variant.costPrice === 'number'
                  ? item.variant.costPrice
                  : item.variant.costPrice.toNumber(),
          }
        : undefined,
    };
  }

  private mapOrder(order: {
    id: string;
    poNumber: string;
    supplierId: string;
    warehouseId: string | null;
    status: PurchaseOrderStatus;
    totalAmount: { toNumber(): number } | number;
    orderedAt: Date | null;
    expectedDeliveryDate: Date | null;
    receivedAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    supplier?: {
      id: string;
      name: string;
      code: string;
      phone: string | null;
    };
    warehouse?: {
      id: string;
      name: string;
      code: string;
    } | null;
    items?: Array<{
      id: string;
      purchaseOrderId: string;
      variantId: string;
      orderedQuantity: number;
      receivedQuantity: number;
      unitCost: { toNumber(): number } | number;
      lineTotal: { toNumber(): number } | number;
      createdAt: Date;
      updatedAt: Date;
      variant?: {
        id: string;
        sku: string;
        name: string;
        costPrice: { toNumber(): number } | number | null;
      };
    }>;
  }): PurchaseOrderEntity {
    return {
      ...order,
      totalAmount:
        typeof order.totalAmount === 'number'
          ? order.totalAmount
          : order.totalAmount.toNumber(),
      items: order.items ? order.items.map(i => this.mapItem(i)) : undefined,
    };
  }

  async listPurchaseOrders(
    filter: PurchaseOrderFilterQuery,
  ): Promise<{ items: PurchaseOrderEntity[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      ...(filter.variantId
        ? {
            items: {
              some: { variantId: filter.variantId },
            },
          }
        : {}),
      ...(filter.startDate || filter.endDate
        ? {
            createdAt: {
              ...(filter.startDate ? { gte: filter.startDate } : {}),
              ...(filter.endDate ? { lte: filter.endDate } : {}),
            },
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
            select: { id: true, name: true, code: true, phone: true },
          },
          warehouse: {
            select: { id: true, name: true, code: true },
          },
          items: {
            include: {
              variant: {
                select: { id: true, sku: true, name: true, costPrice: true },
              },
            },
          },
        },
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return {
      items: orders.map(o => this.mapOrder(o)),
      total,
    };
  }

  async findPurchaseOrderById(id: string): Promise<PurchaseOrderEntity | null> {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: {
          select: { id: true, name: true, code: true, phone: true },
        },
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true, costPrice: true },
            },
          },
        },
      },
    });

    return order ? this.mapOrder(order) : null;
  }

  async findPurchaseOrderByPoNumber(poNumber: string): Promise<PurchaseOrderEntity | null> {
    const order = await prisma.purchaseOrder.findUnique({
      where: { poNumber },
      include: {
        supplier: {
          select: { id: true, name: true, code: true, phone: true },
        },
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true, costPrice: true },
            },
          },
        },
      },
    });

    return order ? this.mapOrder(order) : null;
  }

  async createPurchaseOrder(data: {
    poNumber: string;
    supplierId: string;
    warehouseId: string | null;
    status: PurchaseOrderStatus;
    totalAmount: number;
    expectedDeliveryDate?: Date;
    notes?: string;
    items: CreatePoItemInput[];
  }): Promise<PurchaseOrderEntity> {
    const created = await prisma.purchaseOrder.create({
      data: {
        poNumber: data.poNumber,
        supplierId: data.supplierId,
        warehouseId: data.warehouseId,
        status: data.status,
        totalAmount: data.totalAmount,
        expectedDeliveryDate: data.expectedDeliveryDate ?? null,
        notes: data.notes ?? null,
        items: {
          create: data.items.map(item => ({
            variantId: item.variantId,
            orderedQuantity: item.orderedQuantity,
            receivedQuantity: 0,
            unitCost: item.unitCost,
            lineTotal: item.orderedQuantity * item.unitCost,
          })),
        },
      },
      include: {
        supplier: {
          select: { id: true, name: true, code: true, phone: true },
        },
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true, costPrice: true },
            },
          },
        },
      },
    });

    return this.mapOrder(created);
  }

  async updateStatus(
    id: string,
    status: PurchaseOrderStatus,
    extraData?: { orderedAt?: Date; receivedAt?: Date },
  ): Promise<PurchaseOrderEntity> {
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        ...(extraData?.orderedAt !== undefined ? { orderedAt: extraData.orderedAt } : {}),
        ...(extraData?.receivedAt !== undefined ? { receivedAt: extraData.receivedAt } : {}),
      },
      include: {
        supplier: {
          select: { id: true, name: true, code: true, phone: true },
        },
        warehouse: {
          select: { id: true, name: true, code: true },
        },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true, costPrice: true },
            },
          },
        },
      },
    });

    return this.mapOrder(updated);
  }

  async updateReceivedQuantity(
    itemId: string,
    receivedQuantity: number,
  ): Promise<PurchaseOrderItemEntity> {
    const updated = await prisma.purchaseOrderItem.update({
      where: { id: itemId },
      data: { receivedQuantity },
      include: {
        variant: {
          select: { id: true, sku: true, name: true, costPrice: true },
        },
      },
    });

    return this.mapItem(updated);
  }
}

export const purchaseOrdersRepository = new PurchaseOrdersRepository();
