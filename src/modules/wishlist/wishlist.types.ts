export interface WishlistItemEntity {
  id: string;
  wishlistId: string;
  productId: string;
  variantId: string | null;
  createdAt: Date;
  product?: {
    id: string;
    name: string;
    slug: string;
    status: string;
    inventoryType: string;
    thumbnailUrl?: string | null;
  };
  variant?: {
    id: string;
    sku: string;
    name: string;
    price: number;
    compareAtPrice: number | null;
    isActive: boolean;
    deletedAt: Date | null;
  } | null;
}

export interface WishlistEntity {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items: WishlistItemEntity[];
}

export interface WishlistItemDto {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
  thumbnailUrl: string | null;
  inventoryType: string;
  isAvailable: boolean;
  createdAt: string;
}

export interface WishlistResponseDto {
  wishlist: {
    id: string;
    userId: string;
    totalItems: number;
    items: WishlistItemDto[];
  };
}

export interface IWishlistRepository {
  findWishlistByUserId(userId: string): Promise<WishlistEntity | null>;
  createWishlist(userId: string): Promise<WishlistEntity>;
  addItem(data: {
    wishlistId: string;
    productId: string;
    variantId?: string | null;
  }): Promise<WishlistItemEntity>;
  removeItem(wishlistId: string, variantIdOrProductId: string): Promise<boolean>;
  findItem(wishlistId: string, variantIdOrProductId: string): Promise<WishlistItemEntity | null>;
  clearWishlist(wishlistId: string): Promise<void>;
}
