import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import type { PaymentGateway, PaymentProvider } from '../payments.types';
import { sslcommerzGateway } from './sslcommerz.gateway';
import { codGateway } from './cod.gateway';
import { bkashStubGateway, nagadStubGateway } from './stub.gateway';

export class PaymentGatewayRegistry {
  private readonly gateways: Map<PaymentProvider, PaymentGateway> = new Map();

  constructor() {
    this.registerGateway('SSLCOMMERZ', sslcommerzGateway);
    this.registerGateway('COD', codGateway);
    this.registerGateway('BKASH', bkashStubGateway);
    this.registerGateway('NAGAD', nagadStubGateway);
  }

  registerGateway(provider: PaymentProvider, gateway: PaymentGateway): void {
    this.gateways.set(provider, gateway);
  }

  isProviderEnabled(provider: PaymentProvider): boolean {
    const rawProviders = env.PAYMENT_ENABLED_PROVIDERS || 'COD,SSLCOMMERZ';
    const enabledList = rawProviders.split(',').map(p => p.trim().toUpperCase());
    return enabledList.includes(provider.toUpperCase());
  }

  getGateway(provider: PaymentProvider): PaymentGateway {
    if (!this.isProviderEnabled(provider)) {
      throw AppError.badRequest(`Payment provider '${provider}' is currently disabled`);
    }

    const gateway = this.gateways.get(provider);
    if (!gateway) {
      throw AppError.badRequest(`Unsupported payment provider '${provider}'`);
    }

    return gateway;
  }
}

export const paymentGatewayRegistry = new PaymentGatewayRegistry();
