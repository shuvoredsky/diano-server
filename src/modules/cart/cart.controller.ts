import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { cartService } from './cart.service';
import {
  addCartItemSchema,
  updateCartItemSchema,
  mergeCartSchema,
} from './cart.validation';

export const CART_COOKIE_NAME = 'diano_cart_token';

export class CartController {
  constructor(private readonly service = cartService) {}

  private extractGuestToken(req: Request): string | undefined {
    return (req.cookies?.[CART_COOKIE_NAME] as string) || (req.headers['x-cart-token'] as string) || undefined;
  }

  private attachGuestToken(res: Response, rawToken?: string): void {
    if (!rawToken) return;

    res.cookie(CART_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.setHeader('x-cart-token', rawToken);
  }

  getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const guestToken = this.extractGuestToken(req);
      const { cart, newRawGuestToken } = await this.service.getOrCreateCart(req.user?.userId, guestToken);

      this.attachGuestToken(res, newRawGuestToken);
      const responseData = this.service.formatCartResponse(cart);

      ApiResponse.success(res, 'Cart retrieved successfully', responseData);
    } catch (err) {
      next(err);
    }
  };

  addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = addCartItemSchema.parse(req.body);
      const guestToken = this.extractGuestToken(req);
      const { cart, newRawGuestToken } = await this.service.getOrCreateCart(req.user?.userId, guestToken);

      this.attachGuestToken(res, newRawGuestToken);
      const updatedCartDto = await this.service.addItem({
        cartId: cart.id,
        variantId: body.variantId,
        quantity: body.quantity,
      });

      ApiResponse.success(res, 'Item added to cart successfully', updatedCartDto);
    } catch (err) {
      next(err);
    }
  };

  updateItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const variantId = req.params.variantId as string;
      const body = updateCartItemSchema.parse(req.body);
      const guestToken = this.extractGuestToken(req);
      const { cart, newRawGuestToken } = await this.service.getOrCreateCart(req.user?.userId, guestToken);

      this.attachGuestToken(res, newRawGuestToken);
      const updatedCartDto = await this.service.updateItemQuantity({
        cartId: cart.id,
        variantId,
        quantity: body.quantity,
      });

      ApiResponse.success(res, 'Cart item updated successfully', updatedCartDto);
    } catch (err) {
      next(err);
    }
  };

  removeItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const variantId = req.params.variantId as string;
      const guestToken = this.extractGuestToken(req);
      const { cart, newRawGuestToken } = await this.service.getOrCreateCart(req.user?.userId, guestToken);

      this.attachGuestToken(res, newRawGuestToken);
      const updatedCartDto = await this.service.removeItem(cart.id, variantId);

      ApiResponse.success(res, 'Cart item removed successfully', updatedCartDto);
    } catch (err) {
      next(err);
    }
  };

  clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const guestToken = this.extractGuestToken(req);
      const { cart, newRawGuestToken } = await this.service.getOrCreateCart(req.user?.userId, guestToken);

      this.attachGuestToken(res, newRawGuestToken);
      const updatedCartDto = await this.service.clearCart(cart.id);

      ApiResponse.success(res, 'Cart cleared successfully', updatedCartDto);
    } catch (err) {
      next(err);
    }
  };

  mergeCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = mergeCartSchema.parse(req.body);
      const guestToken = body.guestToken || this.extractGuestToken(req);

      const userId = req.user?.userId;
      if (!userId) {
        throw AppError.unauthorized('User authentication required to merge carts');
      }

      const result = await this.service.mergeCart(userId, guestToken);

      // Clear guest token cookie after successful merge
      res.clearCookie(CART_COOKIE_NAME);

      ApiResponse.success(res, 'Cart merged successfully', result);
    } catch (err) {
      next(err);
    }
  };

  validateCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const guestToken = this.extractGuestToken(req);
      const { cart, newRawGuestToken } = await this.service.getOrCreateCart(req.user?.userId, guestToken);

      this.attachGuestToken(res, newRawGuestToken);
      const result = await this.service.validateCart(cart.id);

      ApiResponse.success(res, 'Cart validated successfully', result);
    } catch (err) {
      next(err);
    }
  };
}

export const cartController = new CartController();
