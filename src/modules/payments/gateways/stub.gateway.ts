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

export class StubGateway implements PaymentGateway {
  constructor(readonly provider: PaymentProvider) {}

  async initialize(_input: GatewayInitializeInput): Promise<GatewayInitializeResult> {
    throw AppError.notImplemented(
      `Payment provider '${this.provider}' is not yet implemented (scheduled for M10b). Fake success is strictly prohibited.`,
    );
  }

  async verify(_input: GatewayVerifyInput): Promise<GatewayVerifyResult> {
    throw AppError.notImplemented(`Payment provider '${this.provider}' verification is not implemented`);
  }

  async handleCallback(_payload: Record<string, unknown>): Promise<GatewayCallbackResult> {
    throw AppError.notImplemented(`Payment provider '${this.provider}' callbacks are not implemented`);
  }

  async handleIpn(_payload: Record<string, unknown>): Promise<GatewayIpnResult> {
    throw AppError.notImplemented(`Payment provider '${this.provider}' IPN is not implemented`);
  }

  async initiateRefund(_input: GatewayRefundInput): Promise<GatewayRefundResult> {
    throw AppError.notImplemented(`Payment provider '${this.provider}' refunds are not implemented`);
  }

  async verifyRefund(_refundId: string): Promise<GatewayRefundResult> {
    throw AppError.notImplemented(`Payment provider '${this.provider}' refund verification is not implemented`);
  }

  async queryTransaction(_transactionId: string): Promise<GatewayQueryResult> {
    throw AppError.notImplemented(`Payment provider '${this.provider}' transaction query is not implemented`);
  }
}

export const bkashStubGateway = new StubGateway('BKASH');
export const nagadStubGateway = new StubGateway('NAGAD');
