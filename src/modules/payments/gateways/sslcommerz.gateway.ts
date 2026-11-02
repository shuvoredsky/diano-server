import crypto from 'node:crypto';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import type {
  PaymentGateway,
  PaymentProvider,
  GatewayInitializeInput,
  GatewayInitializeResult,
  GatewayVerifyInput,
  GatewayVerifyResult,
  GatewayCallbackResult,
  GatewayIpnResult,
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayQueryResult,
  PaymentStatus,
} from '../payments.types';

export class SslcommerzGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'SSLCOMMERZ';

  private readonly storeId: string;
  private readonly storePasswd: string;
  private readonly isLive: boolean;
  private readonly baseUrl: string;

  constructor(config?: { storeId?: string; storePasswd?: string; isLive?: boolean }) {
    this.storeId = config?.storeId ?? env.SSLCOMMERZ_STORE_ID ?? '';
    this.storePasswd = config?.storePasswd ?? env.SSLCOMMERZ_STORE_PASSWORD ?? '';
    this.isLive = config?.isLive ?? env.SSLCOMMERZ_IS_LIVE ?? false;
    this.baseUrl = this.isLive
      ? 'https://securepay.sslcommerz.com'
      : 'https://sandbox.sslcommerz.com';
  }

  /**
   * Generates MD5 hash for a given UTF-8 string
   */
  private md5(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Initializes a payment session via SSLCOMMERZ v4 Session API
   * Official Doc: https://developer.sslcommerz.com/doc/v4/
   * Endpoint: POST /gwprocess/v4/api.php
   */
  async initialize(input: GatewayInitializeInput): Promise<GatewayInitializeResult> {
    if (!this.storeId || !this.storePasswd) {
      throw AppError.internal('SSLCOMMERZ store credentials are not configured');
    }

    const backendPublicUrl = env.BACKEND_PUBLIC_URL || 'http://localhost:5000';
    const params = new URLSearchParams({
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      total_amount: input.amount.toFixed(2),
      currency: input.currency || 'BDT',
      tran_id: input.transactionId,
      success_url: `${backendPublicUrl}/api/v1/payments/sslcommerz/success`,
      fail_url: `${backendPublicUrl}/api/v1/payments/sslcommerz/fail`,
      cancel_url: `${backendPublicUrl}/api/v1/payments/sslcommerz/cancel`,
      ipn_url: `${backendPublicUrl}/api/v1/payments/sslcommerz/ipn`,
      cus_name: input.customer.name || 'Customer',
      cus_email: input.customer.email || 'customer@example.com',
      cus_phone: input.customer.phone || '01700000000',
      cus_add1: input.shippingAddress.address1 || 'Dhaka',
      cus_city: input.shippingAddress.city || 'Dhaka',
      cus_country: input.shippingAddress.country || 'Bangladesh',
      shipping_method: 'NO',
      product_name: input.orderNumber,
      product_category: 'General',
      product_profile: 'general',
    });

    try {
      const response = await fetch(`${this.baseUrl}/gwprocess/v4/api.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw AppError.badGateway(`SSLCOMMERZ session init failed with HTTP ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
        const errorMsg =
          (data.failedreason as string) ||
          (data.status as string) ||
          'Session initialization failed';
        throw AppError.badGateway(`SSLCOMMERZ error: ${errorMsg}`);
      }

      return {
        gatewayUrl: data.GatewayPageURL as string,
        sessionKey: data.sessionkey as string,
        providerReference: data.sessionkey as string,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw AppError.badGateway(`SSLCOMMERZ connection error: ${message}`);
    }
  }

  /**
   * Validates a transaction via SSLCOMMERZ Order Validation API
   * Official Doc: https://developer.sslcommerz.com/doc/v4/
   * Endpoint: GET /validator/api/validationserverAPI.php
   */
  async verify(input: GatewayVerifyInput): Promise<GatewayVerifyResult> {
    if (!input.valId) {
      return {
        isValid: false,
        status: 'INVALID',
        transactionId: input.transactionId || '',
        amount: 0,
        currency: 'BDT',
        errorMessage: 'Missing val_id for SSLCOMMERZ verification',
      };
    }

    const queryParams = new URLSearchParams({
      val_id: input.valId,
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      v: '1',
      format: 'json',
    });

    try {
      const response = await fetch(
        `${this.baseUrl}/validator/api/validationserverAPI.php?${queryParams.toString()}`,
        { method: 'GET' },
      );

      if (!response.ok) {
        return {
          isValid: false,
          status: 'FAILED',
          transactionId: input.transactionId || '',
          amount: 0,
          currency: 'BDT',
          errorMessage: `SSLCOMMERZ validation server responded with HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const isValid = data.status === 'VALID' || data.status === 'VALIDATED';

      return {
        isValid,
        status: isValid ? 'VALID' : 'FAILED',
        transactionId: (data.tran_id as string) || input.transactionId || '',
        bankTranId: data.bank_tran_id as string | undefined,
        amount: parseFloat((data.amount as string) || '0'),
        currency: (data.currency_type as string) || (data.currency as string) || 'BDT',
        cardType: data.card_type as string | undefined,
        cardBrand: data.card_brand as string | undefined,
        validationId: data.val_id as string | undefined,
        rawResponse: data,
        errorMessage: isValid ? undefined : (data.error as string) || 'Transaction status is not VALID',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isValid: false,
        status: 'FAILED',
        transactionId: input.transactionId || '',
        amount: 0,
        currency: 'BDT',
        errorMessage: `Validation request error: ${message}`,
      };
    }
  }

  /**
   * Handles customer browser redirect callback from SSLCOMMERZ.
   * Zero trust: Never trusts the redirect body status; parses val_id for server verification.
   */
  async handleCallback(payload: Record<string, unknown>): Promise<GatewayCallbackResult> {
    const transactionId = typeof payload.tran_id === 'string' ? payload.tran_id : '';
    const valId = typeof payload.val_id === 'string' ? payload.val_id : undefined;
    const bankTranId = typeof payload.bank_tran_id === 'string' ? payload.bank_tran_id : undefined;
    const status = typeof payload.status === 'string' ? payload.status : '';

    return {
      success: status === 'VALID' || status === 'VALIDATED',
      transactionId,
      valId,
      status,
      bankTranId,
      amount: payload.amount ? parseFloat(String(payload.amount)) : undefined,
      currency: typeof payload.currency === 'string' ? payload.currency : 'BDT',
      errorMessage: typeof payload.error === 'string' ? payload.error : undefined,
      rawPayload: payload,
    };
  }

  /**
   * Verifies IPN cryptographic hash authenticity according to official docs.
   * Official Algorithm:
   * 1. Explode verify_key by comma.
   * 2. Append store_passwd = md5(storePassword).
   * 3. Sort keys alphabetically.
   * 4. Build query string: key1=val1&key2=val2...
   * 5. MD5 of string must equal verify_sign.
   */
  verifyIpnSignature(payload: Record<string, unknown>): boolean {
    const verifySign = payload.verify_sign;
    const verifyKey = payload.verify_key;

    if (!verifySign || !verifyKey) {
      return false;
    }

    const keys = (verifyKey as string).split(',');
    keys.push('store_passwd');

    const mappedData: Record<string, string> = {};
    for (const key of keys) {
      if (key === 'store_passwd') {
        mappedData[key] = this.md5(this.storePasswd);
      } else if (payload[key] !== undefined && payload[key] !== null) {
        mappedData[key] = String(payload[key]).trim();
      }
    }

    const sortedKeys = Object.keys(mappedData).sort();
    const hashString = sortedKeys.map(k => `${k}=${mappedData[k]}`).join('&');
    const calculatedSign = this.md5(hashString);
    const a = Buffer.from(calculatedSign.toLowerCase(), 'utf8');
    const b = Buffer.from(String(verifySign).trim().toLowerCase(), 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * Handles incoming Instant Payment Notification (IPN).
   * Validates authenticity signature first, then prepares for Order Validation API call.
   */
  async handleIpn(payload: Record<string, unknown>): Promise<GatewayIpnResult> {
    const isAuthentic = this.verifyIpnSignature(payload);

    return {
      isAuthentic,
      transactionId: typeof payload.tran_id === 'string' ? payload.tran_id : '',
      valId: typeof payload.val_id === 'string' ? payload.val_id : undefined,
      status: typeof payload.status === 'string' ? payload.status : '',
      bankTranId: typeof payload.bank_tran_id === 'string' ? payload.bank_tran_id : undefined,
      amount: payload.amount ? parseFloat(String(payload.amount)) : undefined,
      currency: typeof payload.currency === 'string' ? payload.currency : 'BDT',
      error: isAuthentic ? undefined : 'IPN signature verification failed',
      rawPayload: payload,
    };
  }

  /**
   * Initiates a refund via SSLCOMMERZ Refund API
   * Endpoint: GET /validator/api/merchantTransIDvalidationAPI.php
   */
  async initiateRefund(input: GatewayRefundInput): Promise<GatewayRefundResult> {
    const queryParams = new URLSearchParams({
      bank_tran_id: input.bankTranId,
      refund_amount: input.amount.toFixed(2),
      refund_remarks: input.reason,
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      refe_id: input.refundRefId,
      v: '1',
      format: 'json',
    });

    try {
      const response = await fetch(
        `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${queryParams.toString()}`,
        { method: 'GET' },
      );

      if (!response.ok) {
        return {
          success: false,
          refundStatus: 'FAILED',
          errorMessage: `SSLCOMMERZ refund request failed with HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const isSuccess = data.status === 'success' || data.status === 'processing';

      return {
        success: isSuccess,
        refundStatus: isSuccess ? 'COMPLETED' : 'FAILED',
        providerRefundId: (data.refund_ref_id as string) || (data.trans_id as string),
        rawResponse: data,
        errorMessage: isSuccess ? undefined : (data.errorReason as string) || (data.status as string),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        refundStatus: 'FAILED',
        errorMessage: `Refund connection error: ${message}`,
      };
    }
  }

  /**
   * Verifies refund status
   */
  async verifyRefund(_refundId: string, bankTranId?: string): Promise<GatewayRefundResult> {
    if (!bankTranId) {
      return {
        success: false,
        refundStatus: 'FAILED',
        errorMessage: 'bankTranId is required to query refund status',
      };
    }

    const queryParams = new URLSearchParams({
      bank_tran_id: bankTranId,
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      v: '1',
      format: 'json',
    });

    try {
      const response = await fetch(
        `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${queryParams.toString()}`,
        { method: 'GET' },
      );

      if (!response.ok) {
        return {
          success: false,
          refundStatus: 'FAILED',
          errorMessage: `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const isSuccess = data.status === 'success' || data.status === 'processing';

      return {
        success: isSuccess,
        refundStatus: isSuccess ? 'COMPLETED' : 'FAILED',
        providerRefundId: data.refund_ref_id as string | undefined,
        rawResponse: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        refundStatus: 'FAILED',
        errorMessage: message,
      };
    }
  }

  /**
   * Reconciles transaction status via SSLCOMMERZ Transaction Query API
   * Endpoint: GET /validator/api/merchantTransIDvalidationAPI.php?tran_id=...
   */
  async queryTransaction(transactionId: string): Promise<GatewayQueryResult> {
    const queryParams = new URLSearchParams({
      tran_id: transactionId,
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      v: '1',
      format: 'json',
    });

    try {
      const response = await fetch(
        `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${queryParams.toString()}`,
        { method: 'GET' },
      );

      if (!response.ok) {
        return {
          status: 'PENDING',
          transactionId,
          rawResponse: { error: `HTTP ${response.status}` },
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      let status: PaymentStatus = 'PENDING';

      if (data.status === 'VALID' || data.status === 'VALIDATED') {
        status = 'PAID';
      } else if (data.status === 'FAILED') {
        status = 'FAILED';
      } else if (data.status === 'CANCELLED') {
        status = 'CANCELLED';
      } else if (data.status === 'EXPIRED') {
        status = 'EXPIRED';
      }

      return {
        status,
        transactionId,
        bankTranId: data.bank_tran_id as string | undefined,
        amount: data.amount ? parseFloat(data.amount as string) : undefined,
        currency: (data.currency as string) || 'BDT',
        rawResponse: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'PENDING',
        transactionId,
        rawResponse: { error: message },
      };
    }
  }
}

export const sslcommerzGateway = new SslcommerzGateway();
