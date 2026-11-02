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

export class CodGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'COD';

  async initialize(input: GatewayInitializeInput): Promise<GatewayInitializeResult> {
    return {
      gatewayUrl: '',
      providerReference: `COD-${input.orderNumber}`,
    };
  }

  async verify(input: GatewayVerifyInput): Promise<GatewayVerifyResult> {
    return {
      isValid: true,
      status: 'VALID',
      transactionId: input.transactionId || '',
      amount: input.amount || 0,
      currency: 'BDT',
    };
  }

  async handleCallback(payload: Record<string, any>): Promise<GatewayCallbackResult> {
    return {
      success: true,
      transactionId: payload.tran_id || '',
      status: 'PENDING',
      rawPayload: payload,
    };
  }

  async handleIpn(payload: Record<string, any>): Promise<GatewayIpnResult> {
    return {
      isAuthentic: true,
      transactionId: payload.tran_id || '',
      status: 'PENDING',
      rawPayload: payload,
    };
  }

  async initiateRefund(_input: GatewayRefundInput): Promise<GatewayRefundResult> {
    // COD refunds are processed manually by store administrators
    return {
      success: true,
      refundStatus: 'COMPLETED',
      providerRefundId: `COD-REF-${Date.now()}`,
    };
  }

  async verifyRefund(_refundId: string): Promise<GatewayRefundResult> {
    return {
      success: true,
      refundStatus: 'COMPLETED',
    };
  }

  async queryTransaction(transactionId: string): Promise<GatewayQueryResult> {
    return {
      status: 'PENDING',
      transactionId,
    };
  }
}

export const codGateway = new CodGateway();
