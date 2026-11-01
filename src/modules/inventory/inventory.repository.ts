import { prisma } from '@/config/database';
import { Prisma } from '@prisma/client';
import { AppError } from '@/utils/app-error';
import type {
  IInventoryRepository,
  InventoryEntity,
  StockMovementEntity,
  ReceiveStockInput,
  AdjustStockInput,
  ReserveStockInput,
  ReleaseReservationInput,
  CommitReservationInput,
  MarkDamagedInput,
  RestockInput,
  TransferStockInput,
  StockOperationResult,
  TransferStockResult,
  InventoryQueryFilter,
  StockMovementQueryFilter,
  InventorySummaryDto,
  StockAction,
} from './inventory.types';

const TX_OPTIONS = { maxWait: 15000, timeout: 20000 };

export class PrismaInventoryRepository implements IInventoryRepository {
  /**
   * Helper: formats raw Prisma Inventory entity with computed availableStock
   */
  private formatInventory(inv: {
    id: string;
    variantId: string;
    warehouseId: string;
    onHand: number;
    reserved: number;
    damaged: number;
    safetyStock: number;
    createdAt: Date;
    updatedAt: Date;
    variant?: unknown;
    warehouse?: unknown;
  }): InventoryEntity {
    return {
      ...inv,
      availableStock: inv.onHand - inv.reserved - inv.damaged,
    } as InventoryEntity;
  }

  async findInventory(variantId: string, warehouseId: string): Promise<InventoryEntity | null> {
    const inv = await prisma.inventory.findUnique({
      where: {
        variantId_warehouseId: { variantId, warehouseId },
      },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, slug: true, categoryId: true },
            },
          },
        },
        warehouse: {
          select: { id: true, name: true, code: true, isDefault: true },
        },
      },
    });

    if (!inv) return null;
    return this.formatInventory(inv);
  }

  async findOrCreateInventory(variantId: string, warehouseId: string): Promise<InventoryEntity> {
    const inv = await prisma.inventory.upsert({
      where: {
        variantId_warehouseId: { variantId, warehouseId },
      },
      update: {},
      create: {
        variantId,
        warehouseId,
        onHand: 0,
        reserved: 0,
        damaged: 0,
        safetyStock: 0,
      },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, slug: true, categoryId: true },
            },
          },
        },
        warehouse: {
          select: { id: true, name: true, code: true, isDefault: true },
        },
      },
    });

    return this.formatInventory(inv);
  }

  async findMovementByReference(
    referenceType: string,
    referenceId: string,
    action: string,
  ): Promise<StockMovementEntity | null> {
    const movement = await prisma.stockMovement.findFirst({
      where: {
        referenceType,
        referenceId,
        action,
      },
      include: {
        variant: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
    });

    return movement as unknown as StockMovementEntity | null;
  }

  /**
   * Internal Atomic Mutator:
   * Single internal function that executes conditional atomic update and stock movement logging
   * inside the exact same Prisma transaction.
   * No read-then-write race conditions.
   * Prohibits inventory modification without ledger movement and vice-versa.
   */
  private async executeAtomicStockChange(
    tx: Prisma.TransactionClient,
    params: {
      variantId: string;
      warehouseId: string;
      action: StockAction;
      type: Prisma.StockMovementCreateInput['type'];
      quantity: number;
      reason: string;
      referenceType: string;
      referenceId: string;
      actorId?: string;
    },
  ): Promise<StockOperationResult> {
    // 1. Ensure inventory row exists
    let inventory = await tx.inventory.findUnique({
      where: {
        variantId_warehouseId: {
          variantId: params.variantId,
          warehouseId: params.warehouseId,
        },
      },
    });

    if (!inventory) {
      inventory = await tx.inventory.create({
        data: {
          variantId: params.variantId,
          warehouseId: params.warehouseId,
          onHand: 0,
          reserved: 0,
          damaged: 0,
          safetyStock: 0,
        },
      });
    }

    const qty = Math.abs(params.quantity);
    const invId = inventory.id;

    // 2. Conditional Atomic UPDATE via raw SQL to strictly prevent negative stock
    switch (params.action) {
      case 'RECEIVE':
      case 'RESTOCK': {
        const count = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "onHand" = "onHand" + ${qty}, "updatedAt" = NOW()
          WHERE "id" = ${invId}
        `;
        if (count === 0) {
          throw AppError.badRequest('Failed to update inventory');
        }
        break;
      }

      case 'RESERVE': {
        // Atomic conditional check: availableStock >= qty
        // (onHand - reserved - damaged) >= qty
        const count = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reserved" = "reserved" + ${qty}, "updatedAt" = NOW()
          WHERE "id" = ${invId} AND ("onHand" - "reserved" - "damaged") >= ${qty}
        `;
        if (count === 0) {
          throw AppError.badRequest(
            `Insufficient available stock for variant '${params.variantId}' (Requested: ${qty})`,
          );
        }
        break;
      }

      case 'RELEASE': {
        // Atomic conditional check: reserved >= qty
        const count = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reserved" = "reserved" - ${qty}, "updatedAt" = NOW()
          WHERE "id" = ${invId} AND "reserved" >= ${qty}
        `;
        if (count === 0) {
          throw AppError.badRequest(
            `Cannot release reservation: requested ${qty} exceeds active reserved quantity`,
          );
        }
        break;
      }

      case 'COMMIT': {
        // Order fulfillment: deduct from reserved and deduct from physical onHand
        const count = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "onHand" = "onHand" - ${qty}, "reserved" = "reserved" - ${qty}, "updatedAt" = NOW()
          WHERE "id" = ${invId} AND "reserved" >= ${qty} AND "onHand" >= ${qty}
        `;
        if (count === 0) {
          throw AppError.badRequest(
            `Cannot commit reservation: insufficient reserved or physical inventory`,
          );
        }
        break;
      }

      case 'ADJUST': {
        if (params.quantity > 0) {
          const count = await tx.$executeRaw`
            UPDATE "Inventory"
            SET "onHand" = "onHand" + ${qty}, "updatedAt" = NOW()
            WHERE "id" = ${invId}
          `;
          if (count === 0) {
            throw AppError.badRequest('Failed to update inventory during adjustment');
          }
        } else if (params.quantity < 0) {
          const count = await tx.$executeRaw`
            UPDATE "Inventory"
            SET "onHand" = "onHand" - ${qty}, "updatedAt" = NOW()
            WHERE "id" = ${invId} AND ("onHand" - "reserved" - "damaged") >= ${qty}
          `;
          if (count === 0) {
            throw AppError.badRequest(
              `Stock adjustment rejected: reduction of ${qty} units would breach non-negative available stock boundary`,
            );
          }
        }
        break;
      }

      case 'DAMAGE': {
        // Quarantines stock into damaged, deducting from available
        const count = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "damaged" = "damaged" + ${qty}, "updatedAt" = NOW()
          WHERE "id" = ${invId} AND ("onHand" - "reserved" - "damaged") >= ${qty}
        `;
        if (count === 0) {
          throw AppError.badRequest(
            `Cannot mark damaged: requested ${qty} units exceeds available sellable stock`,
          );
        }
        break;
      }

      case 'TRANSFER_OUT': {
        // Deducts physical stock from source warehouse
        const count = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "onHand" = "onHand" - ${qty}, "updatedAt" = NOW()
          WHERE "id" = ${invId} AND ("onHand" - "reserved" - "damaged") >= ${qty}
        `;
        if (count === 0) {
          throw AppError.badRequest(
            `Transfer rejected: source warehouse has insufficient available stock (${qty} required)`,
          );
        }
        break;
      }

      case 'TRANSFER_IN': {
        const count = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "onHand" = "onHand" + ${qty}, "updatedAt" = NOW()
          WHERE "id" = ${invId}
        `;
        if (count === 0) {
          throw AppError.badRequest('Failed to update target warehouse inventory');
        }
        break;
      }

      default: {
        throw AppError.badRequest(`Unsupported stock action: ${String(params.action)}`);
      }
    }

    // 3. Re-read updated inventory in same transaction to calculate exact balances
    const updatedInv = await tx.inventory.findUniqueOrThrow({
      where: { id: invId },
      include: {
        variant: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
    });

    const quantityBefore =
      inventory.onHand - inventory.reserved - inventory.damaged;
    const quantityAfter =
      updatedInv.onHand - updatedInv.reserved - updatedInv.damaged;

    // 4. Create Immutable Ledger Entry (StockMovement) in the same transaction
    const movement = await tx.stockMovement.create({
      data: {
        variantId: params.variantId,
        warehouseId: params.warehouseId,
        type: params.type,
        action: params.action,
        quantity: params.quantity,
        quantityBefore,
        quantityAfter,
        reason: params.reason,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        actorId: params.actorId ?? null,
      },
    });

    return {
      inventory: this.formatInventory(updatedInv),
      movement: movement as unknown as StockMovementEntity,
    };
  }

  async receiveStock(input: ReceiveStockInput): Promise<StockOperationResult> {
    return prisma.$transaction(async tx => {
      return this.executeAtomicStockChange(tx, {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        action: 'RECEIVE',
        type: 'PURCHASE_RECEIPT',
        quantity: input.quantity,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actorId: input.actorId,
      });
    }, TX_OPTIONS);
  }

  async adjustStock(input: AdjustStockInput): Promise<StockOperationResult> {
    return prisma.$transaction(async tx => {
      return this.executeAtomicStockChange(tx, {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        action: 'ADJUST',
        type: input.referenceType === 'AUDIT' ? 'AUDIT_ADJUSTMENT' : 'MANUAL_ADJUSTMENT',
        quantity: input.quantity,
        reason: input.reason,
        referenceType: input.referenceType ?? 'MANUAL',
        referenceId: input.referenceId ?? `ADJ-${Date.now()}`,
        actorId: input.actorId,
      });
    }, TX_OPTIONS);
  }

  async reserveStock(input: ReserveStockInput, tx?: Prisma.TransactionClient): Promise<StockOperationResult> {
    const run = async (activeTx: Prisma.TransactionClient) => {
      // Idempotency: check if identical movement already processed
      const existing = await activeTx.stockMovement.findFirst({
        where: {
          variantId: input.variantId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          action: 'RESERVE',
        },
      });

      if (existing) {
        const inv = await activeTx.inventory.findUniqueOrThrow({
          where: {
            variantId_warehouseId: {
              variantId: input.variantId,
              warehouseId: input.warehouseId,
            },
          },
        });
        return {
          inventory: this.formatInventory(inv),
          movement: existing as unknown as StockMovementEntity,
          isIdempotentReplay: true,
        };
      }

      return this.executeAtomicStockChange(activeTx, {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        action: 'RESERVE',
        type: 'ORDER_RESERVATION',
        quantity: input.quantity,
        reason: input.reason ?? `Reserved for ${input.referenceType} ${input.referenceId}`,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actorId: input.actorId,
      });
    };

    if (tx) {
      return run(tx);
    }
    return prisma.$transaction(run, TX_OPTIONS);
  }

  async releaseReservation(input: ReleaseReservationInput, tx?: Prisma.TransactionClient): Promise<StockOperationResult> {
    const run = async (activeTx: Prisma.TransactionClient) => {
      // Idempotency check
      const existing = await activeTx.stockMovement.findFirst({
        where: {
          variantId: input.variantId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          action: 'RELEASE',
        },
      });

      if (existing) {
        const inv = await activeTx.inventory.findUniqueOrThrow({
          where: {
            variantId_warehouseId: {
              variantId: input.variantId,
              warehouseId: input.warehouseId,
            },
          },
        });
        return {
          inventory: this.formatInventory(inv),
          movement: existing as unknown as StockMovementEntity,
          isIdempotentReplay: true,
        };
      }

      return this.executeAtomicStockChange(activeTx, {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        action: 'RELEASE',
        type: 'ORDER_RELEASE',
        quantity: input.quantity,
        reason: input.reason ?? `Released reservation for ${input.referenceType} ${input.referenceId}`,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actorId: input.actorId,
      });
    };

    if (tx) {
      return run(tx);
    }
    return prisma.$transaction(run, TX_OPTIONS);
  }

  async commitReservation(input: CommitReservationInput, tx?: Prisma.TransactionClient): Promise<StockOperationResult> {
    const run = async (activeTx: Prisma.TransactionClient) => {
      // Idempotency check
      const existing = await activeTx.stockMovement.findFirst({
        where: {
          variantId: input.variantId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          action: 'COMMIT',
        },
      });

      if (existing) {
        const inv = await activeTx.inventory.findUniqueOrThrow({
          where: {
            variantId_warehouseId: {
              variantId: input.variantId,
              warehouseId: input.warehouseId,
            },
          },
        });
        return {
          inventory: this.formatInventory(inv),
          movement: existing as unknown as StockMovementEntity,
          isIdempotentReplay: true,
        };
      }

      return this.executeAtomicStockChange(activeTx, {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        action: 'COMMIT',
        type: 'ORDER_FULFILLMENT',
        quantity: input.quantity,
        reason: input.reason ?? `Order fulfilled for ${input.referenceType} ${input.referenceId}`,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actorId: input.actorId,
      });
    };

    if (tx) {
      return run(tx);
    }
    return prisma.$transaction(run, TX_OPTIONS);
  }

  async markDamaged(input: MarkDamagedInput): Promise<StockOperationResult> {
    return prisma.$transaction(async tx => {
      return this.executeAtomicStockChange(tx, {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        action: 'DAMAGE',
        type: 'DAMAGE_ADJUSTMENT',
        quantity: input.quantity,
        reason: input.reason,
        referenceType: input.referenceType ?? 'MANUAL',
        referenceId: input.referenceId ?? `DMG-${Date.now()}`,
        actorId: input.actorId,
      });
    }, TX_OPTIONS);
  }

  async restock(input: RestockInput): Promise<StockOperationResult> {
    return prisma.$transaction(async tx => {
      return this.executeAtomicStockChange(tx, {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        action: 'RESTOCK',
        type: input.referenceType === 'RETURN' ? 'RETURN_RESTOCK' : 'ORDER_CANCELLATION',
        quantity: input.quantity,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actorId: input.actorId,
      });
    }, TX_OPTIONS);
  }

  /**
   * Deterministic lock ordering to prevent deadlock in multi-warehouse concurrent transfers:
   * Always sort warehouse IDs alphabetically before locking.
   */
  async transferStock(input: TransferStockInput): Promise<TransferStockResult> {
    if (input.sourceWarehouseId === input.targetWarehouseId) {
      throw AppError.badRequest('Source and target warehouse must be distinct');
    }

    return prisma.$transaction(async tx => {
      // Deterministic lock acquisition order to avoid circular deadlock
      const sortedWhIds = [input.sourceWarehouseId, input.targetWarehouseId].sort();
      for (const whId of sortedWhIds) {
        await tx.$queryRaw`
          SELECT id FROM "Inventory"
          WHERE "variantId" = ${input.variantId} AND "warehouseId" = ${whId}
          FOR UPDATE
        `;
      }

      const transferRefId = input.referenceId ?? `TRF-${Date.now()}`;

      // 1. Outbound from source warehouse
      const outbound = await this.executeAtomicStockChange(tx, {
        variantId: input.variantId,
        warehouseId: input.sourceWarehouseId,
        action: 'TRANSFER_OUT',
        type: 'TRANSFER_OUT',
        quantity: input.quantity,
        reason: `Transfer outbound to ${input.targetWarehouseId}: ${input.reason}`,
        referenceType: input.referenceType ?? 'TRANSFER',
        referenceId: transferRefId,
        actorId: input.actorId,
      });

      // 2. Inbound to target warehouse
      const inbound = await this.executeAtomicStockChange(tx, {
        variantId: input.variantId,
        warehouseId: input.targetWarehouseId,
        action: 'TRANSFER_IN',
        type: 'TRANSFER_IN',
        quantity: input.quantity,
        reason: `Transfer inbound from ${input.sourceWarehouseId}: ${input.reason}`,
        referenceType: input.referenceType ?? 'TRANSFER',
        referenceId: transferRefId,
        actorId: input.actorId,
      });

      return {
        sourceInventory: outbound.inventory,
        targetInventory: inbound.inventory,
        outboundMovement: outbound.movement,
        inboundMovement: inbound.movement,
      };
    }, TX_OPTIONS);
  }

  async listInventory(
    filter: InventoryQueryFilter,
  ): Promise<{ items: InventoryEntity[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryWhereInput = {
      ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      ...(filter.categoryId
        ? { variant: { product: { categoryId: filter.categoryId } } }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { variant: { sku: { contains: filter.search, mode: 'insensitive' } } },
              { variant: { name: { contains: filter.search, mode: 'insensitive' } } },
              {
                variant: {
                  product: { name: { contains: filter.search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
      ...(filter.outOfStockOnly
        ? { onHand: { lte: 0 } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        include: {
          variant: {
            include: {
              product: {
                select: { id: true, name: true, slug: true, categoryId: true },
              },
            },
          },
          warehouse: {
            select: { id: true, name: true, code: true, isDefault: true },
          },
        },
        orderBy: [{ onHand: 'asc' }, { updatedAt: 'desc' }],
      }),
      prisma.inventory.count({ where }),
    ]);

    return {
      items: items.map(i => this.formatInventory(i)),
      total,
    };
  }

  async listLowStock(
    warehouseId?: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: InventoryEntity[]; total: number }> {
    const skip = (page - 1) * limit;

    // Direct database query checking availableStock <= reorderLevel
    const where: Prisma.InventoryWhereInput = {
      ...(warehouseId ? { warehouseId } : {}),
    };

    const items = await prisma.inventory.findMany({
      where,
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, slug: true, categoryId: true },
            },
          },
        },
        warehouse: {
          select: { id: true, name: true, code: true, isDefault: true },
        },
      },
    });

    const lowStockItems = items
      .map(i => this.formatInventory(i))
      .filter(i => {
        const threshold = i.variant?.reorderLevel ?? i.safetyStock ?? 5;
        return i.availableStock <= threshold;
      });

    const paginated = lowStockItems.slice(skip, skip + limit);

    return {
      items: paginated,
      total: lowStockItems.length,
    };
  }

  async listMovements(
    filter: StockMovementQueryFilter,
  ): Promise<{ items: StockMovementEntity[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {
      ...(filter.variantId ? { variantId: filter.variantId } : {}),
      ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.startDate || filter.endDate
        ? {
            createdAt: {
              ...(filter.startDate ? { gte: filter.startDate } : {}),
              ...(filter.endDate ? { lte: filter.endDate } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        include: {
          variant: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return {
      items: items as unknown as StockMovementEntity[],
      total,
    };
  }

  /**
   * Database-level aggregate calculation for inventory summary.
   * Runs SQL SUM aggregates directly on the database to avoid loading all stock units into Node memory.
   */
  async getInventorySummary(warehouseId?: string): Promise<InventorySummaryDto> {
    const whereClause = warehouseId ? Prisma.sql`WHERE i."warehouseId" = ${warehouseId}` : Prisma.empty;

    const [summaryResult, productsCountResult] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          totalStockUnits: bigint | number | null;
          reserved: bigint | number | null;
          damaged: bigint | number | null;
          available: bigint | number | null;
          stockValue: string | number | null;
          damageValue: string | number | null;
        }>
      >`
        SELECT
          COALESCE(SUM(i."onHand"), 0) AS "totalStockUnits",
          COALESCE(SUM(i."reserved"), 0) AS "reserved",
          COALESCE(SUM(i."damaged"), 0) AS "damaged",
          COALESCE(SUM(i."onHand" - i."reserved" - i."damaged"), 0) AS "available",
          COALESCE(SUM(i."onHand" * COALESCE(v."costPrice", 0)), 0)::text AS "stockValue",
          COALESCE(SUM(i."damaged" * COALESCE(v."costPrice", 0)), 0)::text AS "damageValue"
        FROM "Inventory" i
        JOIN "ProductVariant" v ON i."variantId" = v."id"
        ${whereClause}
      `,
      prisma.product.count({
        where: { deletedAt: null },
      }),
    ]);

    const row = summaryResult[0];
    const stockValNum = Number(row?.stockValue ?? 0);
    const damageValNum = Number(row?.damageValue ?? 0);
    const netValNum = Math.max(0, stockValNum - damageValNum);

    return {
      totalProducts: productsCountResult,
      totalStockUnits: Number(row?.totalStockUnits ?? 0),
      reserved: Number(row?.reserved ?? 0),
      damaged: Number(row?.damaged ?? 0),
      available: Number(row?.available ?? 0),
      stockValue: stockValNum.toFixed(2),
      damageValue: damageValNum.toFixed(2),
      netStockValue: netValNum.toFixed(2),
    };
  }

  async findExpiredReservations(
    before: Date,
  ): Promise<Array<{ variantId: string; warehouseId: string; referenceId: string; quantity: number }>> {
    // Find ORDER_RESERVATION movements created before specified timestamp
    // that have NOT been committed or released yet
    const reservations = await prisma.stockMovement.findMany({
      where: {
        action: 'RESERVE',
        createdAt: { lte: before },
      },
    });

    const activeExpired: Array<{
      variantId: string;
      warehouseId: string;
      referenceId: string;
      quantity: number;
    }> = [];

    for (const r of reservations) {
      const isSettled = await prisma.stockMovement.findFirst({
        where: {
          referenceId: r.referenceId,
          action: { in: ['RELEASE', 'COMMIT'] },
        },
      });

      if (!isSettled) {
        activeExpired.push({
          variantId: r.variantId,
          warehouseId: r.warehouseId,
          referenceId: r.referenceId,
          quantity: r.quantity,
        });
      }
    }

    return activeExpired;
  }
}

export const inventoryRepository = new PrismaInventoryRepository();
