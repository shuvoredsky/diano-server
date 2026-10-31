import type { Decimal } from 'decimal.js';
import type { StockMovementType } from '@prisma/client';

export type StockAction =
  | 'RECEIVE'
  | 'RESERVE'
  | 'RELEASE'
  | 'COMMIT'
  | 'ADJUST'
  | 'DAMAGE'
  | 'RESTOCK'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';

export interface InventoryEntity {
  id: string;
  variantId: string;
  warehouseId: string;
  onHand: number;
  reserved: number;
  damaged: number;
  safetyStock: number;
  availableStock: number; // Computed: onHand - reserved - damaged
  createdAt: Date;
  updatedAt: Date;
  variant?: {
    id: string;
    productId: string;
    name: string;
    sku: string;
    barcode: string | null;
    price: Decimal | string;
    costPrice: Decimal | string | null;
    reorderLevel: number;
    product?: {
      id: string;
      name: string;
      slug: string;
      categoryId: string;
    };
  };
  warehouse?: {
    id: string;
    name: string;
    code: string;
    isDefault: boolean;
  };
}

export interface StockMovementEntity {
  id: string;
  variantId: string;
  warehouseId: string;
  type: StockMovementType;
  action: string | null;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  referenceType: string;
  referenceId: string;
  actorId: string | null;
  createdAt: Date;
  variant?: {
    id: string;
    name: string;
    sku: string;
  };
  warehouse?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface ReceiveStockInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  referenceType: string;
  referenceId: string;
  actorId?: string;
  unitCost?: number;
}

export interface AdjustStockInput {
  variantId: string;
  warehouseId: string;
  quantity: number; // Signed integer: +adds, -removes
  reason: string;
  actorId: string;
  referenceType?: string;
  referenceId?: string;
}

export interface ReserveStockInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  actorId?: string;
  reason?: string;
}

export interface ReleaseReservationInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  actorId?: string;
  reason?: string;
}

export interface CommitReservationInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  actorId?: string;
  reason?: string;
}

export interface MarkDamagedInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  actorId: string;
  referenceType?: string;
  referenceId?: string;
}

export interface RestockInput {
  variantId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  referenceType: string;
  referenceId: string;
  actorId?: string;
}

export interface TransferStockInput {
  variantId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  quantity: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  actorId?: string;
}

export interface StockOperationResult {
  inventory: InventoryEntity;
  movement: StockMovementEntity;
  isIdempotentReplay?: boolean;
}

export interface TransferStockResult {
  sourceInventory: InventoryEntity;
  targetInventory: InventoryEntity;
  outboundMovement: StockMovementEntity;
  inboundMovement: StockMovementEntity;
}

export interface InventoryQueryFilter {
  page?: number;
  limit?: number;
  warehouseId?: string;
  categoryId?: string;
  search?: string;
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
}

export interface StockMovementQueryFilter {
  page?: number;
  limit?: number;
  variantId?: string;
  warehouseId?: string;
  type?: StockMovementType;
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface InventorySummaryDto {
  totalProducts: number;
  totalStockUnits: number;
  available: number;
  reserved: number;
  damaged: number;
  stockValue?: string; // Visible only to users with inventory:view_cost
  damageValue?: string; // Visible only to users with inventory:view_cost
  netStockValue?: string; // Visible only to users with inventory:view_cost
}

export interface IInventoryRepository {
  findInventory(variantId: string, warehouseId: string): Promise<InventoryEntity | null>;
  findOrCreateInventory(variantId: string, warehouseId: string): Promise<InventoryEntity>;
  findMovementByReference(
    referenceType: string,
    referenceId: string,
    action: string,
  ): Promise<StockMovementEntity | null>;
  receiveStock(input: ReceiveStockInput): Promise<StockOperationResult>;
  adjustStock(input: AdjustStockInput): Promise<StockOperationResult>;
  reserveStock(input: ReserveStockInput): Promise<StockOperationResult>;
  releaseReservation(input: ReleaseReservationInput): Promise<StockOperationResult>;
  commitReservation(input: CommitReservationInput): Promise<StockOperationResult>;
  markDamaged(input: MarkDamagedInput): Promise<StockOperationResult>;
  restock(input: RestockInput): Promise<StockOperationResult>;
  transferStock(input: TransferStockInput): Promise<TransferStockResult>;
  listInventory(
    filter: InventoryQueryFilter,
  ): Promise<{ items: InventoryEntity[]; total: number }>;
  listLowStock(
    warehouseId?: string,
    page?: number,
    limit?: number,
  ): Promise<{ items: InventoryEntity[]; total: number }>;
  listMovements(
    filter: StockMovementQueryFilter,
  ): Promise<{ items: StockMovementEntity[]; total: number }>;
  getInventorySummary(warehouseId?: string): Promise<InventorySummaryDto>;
  findExpiredReservations(
    before: Date,
  ): Promise<Array<{ variantId: string; warehouseId: string; referenceId: string; quantity: number }>>;
}
