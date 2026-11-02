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

      const data = (await response.json()) as any;

      if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
        const errorMsg = data.failedreason || data.status || 'Session initialization failed';
        throw AppError.badGateway(`SSLCOMMERZ error: ${errorMsg}`);
      }

      return {
        gatewayUrl: data.GatewayPageURL,
        sessionKey: data.sessionkey,
        providerReference: data.sessionkey,
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw AppError.badGateway(`SSLCOMMERZ connection error: ${err.message}`);
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

      const data = (await response.json()) as any;
      const isValid = data.status === 'VALID' || data.status === 'VALIDATED';

      return {
        isValid,
        status: isValid ? 'VALID' : 'FAILED',
        transactionId: data.tran_id || input.transactionId || '',
        bankTranId: data.bank_tran_id,
        amount: parseFloat(data.amount || '0'),
        currency: data.currency_type || data.currency || 'BDT',
        cardType: data.card_type,
        cardBrand: data.card_brand,
        validationId: data.val_id,
        rawResponse: data,
        errorMessage: isValid ? undefined : data.error || 'Transaction status is not VALID',
      };
    } catch (err: any) {
      return {
        isValid: false,
        status: 'FAILED',
        transactionId: input.transactionId || '',
        amount: 0,
        currency: 'BDT',
        errorMessage: `Validation request error: ${err.message}`,
      };
    }
  }

  /**
   * Handles customer browser redirect callback from SSLCOMMERZ.
   * Zero trust: Never trusts the redirect body status; parses val_id for server verification.
   */
  async handleCallback(payload: Record<string, any>): Promise<GatewayCallbackResult> {
    const transactionId = payload.tran_id;
    const valId = payload.val_id;
    const bankTranId = payload.bank_tran_id;
    const status = payload.status;

    return {
      success: status === 'VALID' || status === 'VALIDATED',
      transactionId,
      valId,
      status,
      bankTranId,
      amount: payload.amount ? parseFloat(payload.amount) : undefined,
      currency: payload.currency || 'BDT',
      errorMessage: payload.error,
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
  verifyIpnSignature(payload: Record<string, any>): boolean {
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

    return calculatedSign.toLowerCase() === (verifySign as string).toLowerCase();
  }

  /**
   * Handles incoming Instant Payment Notification (IPN).
   * Validates authenticity signature first, then prepares for Order Validation API call.
   */
  async handleIpn(payload: Record<string, any>): Promise<GatewayIpnResult> {
    const isAuthentic = this.verifyIpnSignature(payload);

    return {
      isAuthentic,
      transactionId: payload.tran_id,
      valId: payload.val_id,
      status: payload.status,
      bankTranId: payload.bank_tran_id,
      amount: payload.amount ? parseFloat(payload.amount) : undefined,
      currency: payload.currency || 'BDT',
      rawPayload: payload,
      error: isAuthentic ? undefined : 'Invalid IPN signature hash',
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

      const data = (await response.json()) as any;
      const isSuccess = data.status === 'success' || data.status === 'processing';

      return {
        success: isSuccess,
        refundStatus: isSuccess ? 'COMPLETED' : 'FAILED',
        providerRefundId: data.refund_ref_id || data.trans_id,
        rawResponse: data,
        errorMessage: isSuccess ? undefined : data.errorReason || data.status,
      };
    } catch (err: any) {
      return {
        success: false,
        refundStatus: 'FAILED',
        errorMessage: `Refund connection error: ${err.message}`,
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

      const data = (await response.json()) as any;
      const isSuccess = data.status === 'success' || data.status === 'processing';

      return {
        success: isSuccess,
        refundStatus: isSuccess ? 'COMPLETED' : 'FAILED',
        providerRefundId: data.refund_ref_id,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        refundStatus: 'FAILED',
        errorMessage: err.message,
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

      const data = (await response.json()) as any;
      let status: any = 'PENDING';

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
        bankTranId: data.bank_tran_id,
        amount: data.amount ? parseFloat(data.amount) : undefined,
        currency: data.currency || 'BDT',
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        status: 'PENDING',
        transactionId,
        rawResponse: { error: err.message },
      };
    }
  }
}

export const sslcommerzGateway = new SslcommerzGateway();
