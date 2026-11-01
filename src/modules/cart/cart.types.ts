export interface CartItemEntity {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  priceSnapshot: number;
  createdAt: Date;
  updatedAt: Date;
  variant?: {
    id: string;
    sku: string;
    name: string;
    price: number;
    compareAtPrice: number | null;
    isActive: boolean;
    deletedAt: Date | null;
    product: {
      id: string;
      name: string;
      slug: string;
      status: string;
      inventoryType: string;
      thumbnailUrl?: string | null;
      category?: {
        id: string;
        name: string;
        isActive: boolean;
        deletedAt: Date | null;
      };
    };
  };
}

export interface CartEntity {
  id: string;
  userId: string | null;
  guestToken: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: CartItemEntity[];
}

export interface CartTotals {
  subtotal: string;
  totalItems: number;
  distinctItems: number;
}

export interface CartResponseDto {
  cart: {
    id: string;
    userId: string | null;
    isGuest: boolean;
    items: Array<{
      id: string;
      variantId: string;
      productId: string;
      name: string;
      sku: string;
      quantity: number;
      price: string;
      lineTotal: string;
      compareAtPrice: string | null;
      inventoryType: string;
      thumbnailUrl: string | null;
    }>;
    totals: CartTotals;
  };
}

export type CartValidationIssueType =
  | 'PRICE_CHANGED'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_STOCK'
  | 'UNAVAILABLE';

export interface CartValidationIssue {
  variantId: string;
  productId?: string;
  issue: CartValidationIssueType;
  message: string;
  oldPrice?: string;
  newPrice?: string;
  availableQuantity?: number;
  requestedQuantity?: number;
}

export interface CartValidationResult {
  isValid: boolean;
  issues: CartValidationIssue[];
  updatedTotals: CartTotals;
}

export interface CartMergeClampedItem {
  variantId: string;
  requestedQuantity: number;
  mergedQuantity: number;
  reason: 'CLAMPED_TO_STOCK' | 'CLAMPED_TO_LIMIT';
}

export interface CartMergeResult {
  mergedCartId: string;
  itemsCount: number;
  clampedItems: CartMergeClampedItem[];
}

export interface ICartRepository {
  findCartById(id: string): Promise<CartEntity | null>;
  findCartByUserId(userId: string): Promise<CartEntity | null>;
  findCartByGuestTokenHash(tokenHash: string): Promise<CartEntity | null>;
  createCart(data: {
    userId?: string;
    guestToken?: string;
    expiresAt?: Date;
  }): Promise<CartEntity>;
  addItem(data: {
    cartId: string;
    variantId: string;
    quantity: number;
    priceSnapshot: number;
  }): Promise<CartItemEntity>;
  updateItemQuantity(cartId: string, variantId: string, quantity: number): Promise<CartItemEntity>;
  updateItemPriceSnapshot(itemId: string, newPrice: number): Promise<void>;
  removeItem(cartId: string, variantId: string): Promise<void>;
  clearCart(cartId: string): Promise<void>;
  deleteCart(cartId: string): Promise<void>;
  cleanupExpiredGuestCarts(before: Date): Promise<{ count: number }>;
}
