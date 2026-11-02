import { AppError } from '@/utils/app-error';
import type { PaymentStatus } from './payments.types';

export const PAYMENT_TRANSITION_TABLE: Record<PaymentStatus, readonly PaymentStatus[]> = {
  INITIATED: ['PENDING', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PENDING: ['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PROCESSING: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: ['REFUND_PENDING'],
  COMPLETED: ['REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED', 'PARTIALLY_REFUNDED', 'PAID'],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUND_PENDING'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
} as const;

/**
 * Checks whether a payment status transition is valid according to the domain state machine.
 */
export function isAllowedPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true; // Idempotent same-state replay
  const allowed = PAYMENT_TRANSITION_TABLE[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Asserts transition validity; throws 409 Conflict on invalid transitions.
 * Guarantees that PAID status can NEVER revert to unpaid states.
 */
export function assertValidPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (from === to) return; // Idempotent no-op

  // Explicit check for security: PAID can never be reverted to unpaid/failed
  if (['PAID', 'COMPLETED'].includes(from) && ['INITIATED', 'PENDING', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(to)) {
    throw AppError.conflict(`Security violation: Paid payment cannot be reverted to '${to}'`);
  }

  if (!isAllowedPaymentTransition(from, to)) {
    throw AppError.conflict(`Invalid payment status transition from '${from}' to '${to}'`);
  }
}
