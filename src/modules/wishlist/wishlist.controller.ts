import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { wishlistService } from './wishlist.service';
import { addWishlistItemSchema } from './wishlist.validation';

export class WishlistController {
  constructor(private readonly service = wishlistService) {}

  getWishlist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const wishlist = await this.service.getWishlist(userId);
      ApiResponse.success(res, 'Wishlist retrieved successfully', wishlist);
    } catch (err) {
      next(err);
    }
  };

  addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const body = addWishlistItemSchema.parse(req.body);

      const wishlist = await this.service.addItem(userId, {
        variantId: body.variantId,
        productId: body.productId,
      });

      ApiResponse.success(res, 'Item added to wishlist successfully', wishlist);
    } catch (err) {
      next(err);
    }
  };

  removeItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const variantId = req.params.variantId as string;

      const wishlist = await this.service.removeItem(userId, variantId);
      ApiResponse.success(res, 'Item removed from wishlist successfully', wishlist);
    } catch (err) {
      next(err);
    }
  };

  moveToCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const variantId = req.params.variantId as string;

      const result = await this.service.moveToCart(userId, variantId);
      ApiResponse.success(res, 'Item moved to cart successfully', result);
    } catch (err) {
      next(err);
    }
  };
}

export const wishlistController = new WishlistController();
