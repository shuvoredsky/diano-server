import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { checkoutService } from './checkout.service';
import {
  customerInfoSchema,
  shippingInfoSchema,
  deliveryMethodSchema,
  paymentMethodSchema,
  checkoutEventSchema,
} from './checkout.validation';
import type { DeviceCategory } from './checkout.types';

export const CHECKOUT_SECRET_COOKIE_NAME = 'diano_checkout_secret';
export const CART_COOKIE_NAME = 'diano_cart_token';

export class CheckoutController {
  constructor(private readonly service = checkoutService) {}

  private extractGuestCartToken(req: Request): string | undefined {
    return (req.cookies?.[CART_COOKIE_NAME] as string) || (req.headers['x-cart-token'] as string) || undefined;
  }

  private extractSecretToken(req: Request): string | undefined {
    return (
      (req.headers['x-checkout-secret'] as string) ||
      (req.cookies?.[CHECKOUT_SECRET_COOKIE_NAME] as string) ||
      undefined
    );
  }

  private attachSecretToken(res: Response, secretToken?: string): void {
    if (!secretToken) return;

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie(CHECKOUT_SECRET_COOKIE_NAME, secretToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    });
    res.setHeader('x-checkout-secret', secretToken);
  }

  private detectDevice(req: Request): DeviceCategory {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (/tablet|ipad/i.test(ua)) return 'TABLET';
    if (/mobile|android|iphone/i.test(ua)) return 'MOBILE';
    return 'DESKTOP';
  }

  createSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const guestToken = this.extractGuestCartToken(req);
      const deviceCategory = this.detectDevice(req);
      const ipAddress = req.ip;
      const browser = req.headers['user-agent'];

      const result = await this.service.createSession({
        userId: req.user?.userId,
        guestToken,
        deviceCategory,
        browser,
        ipAddress,
      });

      this.attachSecretToken(res, result.guestSecretToken);
      ApiResponse.created(res, 'Checkout session initiated successfully', result.summary);
    } catch (err) {
      next(err);
    }
  };

  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      const secretToken = this.extractSecretToken(req);
      const isRecovered = req.query.recovered === 'true';

      const summary = await this.service.getSession(
        sessionId,
        req.user?.userId,
        secretToken,
        isRecovered,
      );

      ApiResponse.success(res, 'Checkout session retrieved successfully', summary);
    } catch (err) {
      next(err);
    }
  };

  updateCustomerInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      const secretToken = this.extractSecretToken(req);
      const body = customerInfoSchema.parse(req.body);

      const summary = await this.service.updateCustomerInfo(
        sessionId,
        body,
        req.user?.userId,
        secretToken,
        req.ip,
        req.headers['user-agent'],
      );

      ApiResponse.success(res, 'Customer info updated successfully', summary);
    } catch (err) {
      next(err);
    }
  };

  updateShippingInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      const secretToken = this.extractSecretToken(req);
      const body = shippingInfoSchema.parse(req.body);

      const summary = await this.service.updateShippingInfo(
        sessionId,
        body,
        req.user?.userId,
        secretToken,
      );

      ApiResponse.success(res, 'Shipping info updated successfully', summary);
    } catch (err) {
      next(err);
    }
  };

  updateDeliveryMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      const secretToken = this.extractSecretToken(req);
      const body = deliveryMethodSchema.parse(req.body);

      const summary = await this.service.updateDeliveryMethod(
        sessionId,
        body.code,
        req.user?.userId,
        secretToken,
      );

      ApiResponse.success(res, 'Delivery method updated successfully', summary);
    } catch (err) {
      next(err);
    }
  };

  updatePaymentMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      const secretToken = this.extractSecretToken(req);
      const body = paymentMethodSchema.parse(req.body);

      const summary = await this.service.updatePaymentMethod(
        sessionId,
        body.provider,
        req.user?.userId,
        secretToken,
      );

      ApiResponse.success(res, 'Payment method updated successfully', summary);
    } catch (err) {
      next(err);
    }
  };

  recordEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      const secretToken = this.extractSecretToken(req);
      const body = checkoutEventSchema.parse(req.body);

      await this.service.recordClientEvent(
        sessionId,
        body,
        req.user?.userId,
        secretToken,
      );

      ApiResponse.success(res, 'Event recorded successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const checkoutController = new CheckoutController();
