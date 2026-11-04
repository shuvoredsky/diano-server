import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';

export interface BaseSocketPayload {
  id: string;
  type: string;
  summary: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface OrderNewEvent extends BaseSocketPayload {
  type: 'order:new';
  orderNumber: string;
  totalAmount: number;
}

export interface OrderStatusEvent extends BaseSocketPayload {
  type: 'order:status';
  orderId: string;
  orderNumber: string;
  status: string;
  userId?: string | null;
}

export interface PaymentStatusEvent extends BaseSocketPayload {
  type: 'payment:status';
  paymentId: string;
  status: string;
  orderId: string;
  userId?: string | null;
}

export interface StockLowEvent extends BaseSocketPayload {
  type: 'stock:low';
  variantId: string;
  available: number;
  threshold: number;
}

export interface CheckoutAbandonedEvent extends BaseSocketPayload {
  type: 'checkout:abandoned';
  sessionId: string;
}

export interface FraudReviewEvent extends BaseSocketPayload {
  type: 'fraud:review';
  orderId: string;
  score: number;
  riskTier: string;
}

export interface NotificationNewEvent extends BaseSocketPayload {
  type: 'notification:new';
  notificationId: string;
  channel: string;
  template: string;
  userId?: string | null;
}

export type DomainEvent =
  | OrderNewEvent
  | OrderStatusEvent
  | PaymentStatusEvent
  | StockLowEvent
  | CheckoutAbandonedEvent
  | FraudReviewEvent
  | NotificationNewEvent;

export class AppEventBus extends EventEmitter {
  constructor() {
    super();
    // Allow generous listeners across server lifecycle
    this.setMaxListeners(50);
  }

  emitDomainEvent(event: DomainEvent): boolean {
    logger.debug({ type: event.type, id: event.id }, '[EventBus] Domain event emitted');
    return this.emit(event.type, event);
  }
}

// Singleton in-process event bus
export const eventBus = new AppEventBus();

