import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { paymentsService, type PaymentsService } from './payments.service';
import {
  initiatePaymentSchema,
  adminRefundSchema,
  markCodCollectedSchema,
  listPaymentsQuerySchema,
} from './payments.validation';

export class PaymentsController {
  constructor(private readonly service: PaymentsService = paymentsService) {}

  /**
   * Customer: Initiates online payment session
   * POST /payments/initiate
   */
  initiatePayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = initiatePaymentSchema.parse(req.body);
      const guestToken =
        (req.headers['x-guest-token'] as string) || body.guestToken;

      const result = await this.service.initiatePayment(body, {
        userId: req.user?.userId,
        guestToken,
      });

      ApiResponse.success(res, 'Payment session initialized successfully', result, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Public: SSLCOMMERZ browser redirect on success
   * POST /payments/sslcommerz/success
   */
  handleSslSuccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.handleSslCallback('success', req.body);
      res.redirect(result.redirectUrl);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Public: SSLCOMMERZ browser redirect on failure
   * POST /payments/sslcommerz/fail
   */
  handleSslFail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.handleSslCallback('fail', req.body);
      res.redirect(result.redirectUrl);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Public: SSLCOMMERZ browser redirect on cancellation
   * POST /payments/sslcommerz/cancel
   */
  handleSslCancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.handleSslCallback('cancel', req.body);
      res.redirect(result.redirectUrl);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Public: SSLCOMMERZ Instant Payment Notification (IPN) webhook
   * POST /payments/sslcommerz/ipn
   */
  handleSslIpn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.handleSslIpn(req.body);
      ApiResponse.success(res, 'IPN received', result, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Customer: Check payment status for order
   * GET /payments/:orderId/status
   */
  getPaymentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.orderId as string;
      const guestToken = req.headers['x-guest-token'] as string;

      const result = await this.service.getPaymentStatus(orderId, {
        userId: req.user?.userId,
        guestToken,
      });

      ApiResponse.success(res, 'Payment status retrieved', result, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: List payments with filters
   * GET /admin/payments
   */
  listAdminPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listPaymentsQuerySchema.parse(req.query);
      const { payments, total } = await this.service.listPayments(query);

      const totalPages = Math.ceil(total / query.limit);
      ApiResponse.paginated(res, 'Payments retrieved successfully', payments, {
        page: query.page,
        limit: query.limit,
        totalItems: total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: Get payment details with events timeline
   * GET /admin/payments/:id
   */
  getAdminPaymentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payment = await this.service.getPaymentById(req.params.id as string);
      ApiResponse.success(res, 'Payment details retrieved', payment, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: Refund payment
   * POST /admin/payments/:id/refund
   */
  refundPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.userId;
      if (!actorId) {
        throw AppError.unauthorized('Authentication required');
      }

      const body = adminRefundSchema.parse(req.body);
      const refund = await this.service.refundPayment(req.params.id as string, body, actorId);

      ApiResponse.success(res, 'Refund processed successfully', refund, 200);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Admin: Mark COD payment collected
   * POST /admin/payments/:id/mark-cod-collected
   */
  markCodCollected = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.userId;
      if (!actorId) {
        throw AppError.unauthorized('Authentication required');
      }

      const body = markCodCollectedSchema.parse(req.body);
      const payment = await this.service.markCodCollected(req.params.id as string, actorId, body.note);

      ApiResponse.success(res, 'COD payment marked as collected', payment, 200);
    } catch (err) {
      next(err);
    }
  };
}

export const paymentsController = new PaymentsController();
