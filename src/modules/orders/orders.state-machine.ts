import { AppError } from '@/utils/app-error';
import type { OrderStatus, PaymentProvider } from './orders.types';

export const ORDER_TRANSITION_TABLE: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['RETURNED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
} as const;

export const ORDER_TRANSITION_PERMISSIONS: Record<Exclude<OrderStatus, 'PENDING'>, string> = {
  CONFIRMED: 'order:confirm',
  PROCESSING: 'order:update_status',
  PACKED: 'order:update_status',
  SHIPPED: 'order:ship',
  DELIVERED: 'order:update_status',
  CANCELLED: 'order:cancel',
  RETURNED: 'order:update_status',
  REFUNDED: 'order:update_status',
} as const;

/**
 * Checks whether a status transition is permitted by the state machine
 */
export function isAllowedTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true; // Idempotent same-state replay
  const allowed = ORDER_TRANSITION_TABLE[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Asserts transition validity; throws 409 Conflict on invalid transitions
 */
export function assertValidTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return; // Idempotent no-op
  if (!isAllowedTransition(from, to)) {
    throw AppError.conflict(`Invalid order status transition from '${from}' to '${to}'`);
  }
}

/**
 * Returns required RBAC permission for a status transition
 */
export function getRequiredPermissionForTransition(to: OrderStatus): string {
  if (to === 'PENDING') return 'order:create';
  return ORDER_TRANSITION_PERMISSIONS[to] || 'order:update_status';
}

/**
 * Customers can strictly cancel only their own PENDING Cash on Delivery (COD) orders
 */
export function canCustomerCancel(order: { status: OrderStatus; paymentMethod: PaymentProvider }): boolean {
  return order.status === 'PENDING' && order.paymentMethod === 'COD';
}
