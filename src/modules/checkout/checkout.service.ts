import crypto from 'crypto';
import Decimal from 'decimal.js';
import { AppError } from '@/utils/app-error';
import { prisma } from '@/config/database';
import { cartService } from '@/modules/cart/cart.service';
import { defaultShippingCalculator, type IShippingCalculator } from './checkout.shipping';
import { defaultCouponCalculator, type ICouponCalculator } from './checkout.coupon';
import { checkoutRepository } from './checkout.repository';
import type {
  ICheckoutRepository,
  CheckoutSessionEntity,
  CheckoutSessionSummaryDto,
  CheckoutCartSnapshot,
  CheckoutCustomerInfo,
  CheckoutShippingAddress,
  CheckoutDeliveryMethod,
  PaymentMethodProvider,
  CheckoutEventType,
  DeviceCategory,
} from './checkout.types';

export const CHECKOUT_SESSION_TTL_MINUTES = Number(process.env.CHECKOUT_SESSION_TTL_MINUTES) || 30;
export const CHECKOUT_PII_RETENTION_DAYS = Number(process.env.CHECKOUT_PII_RETENTION_DAYS) || 90;
export const ENABLED_PAYMENT_PROVIDERS: PaymentMethodProvider[] = ['COD', 'SSLCOMMERZ', 'BKASH', 'NAGAD'];

export class CheckoutService {
  constructor(
    private readonly repo: ICheckoutRepository = checkoutRepository,
    private readonly cartSvc = cartService,
    private readonly shippingCalc: IShippingCalculator = defaultShippingCalculator,
    private readonly couponCalc: ICouponCalculator = defaultCouponCalculator,
  ) {}

  generateSessionId(): string {
    // 128-bit unguessable public random identifier (16 bytes = 32 hex chars)
    return crypto.randomBytes(16).toString('hex');
  }

  generateSecretToken(): string {
    // 256-bit unguessable secret token for guest sessions
    return crypto.randomBytes(32).toString('hex');
  }

  hashSecretToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Format CheckoutSessionEntity into summary DTO
   */
  formatSessionSummary(session: CheckoutSessionEntity): CheckoutSessionSummaryDto {
    const snapshot = session.cartSnapshot;

    let subtotalDec = new Decimal(0);
    for (const item of snapshot.items) {
      subtotalDec = subtotalDec.plus(new Decimal(item.price).times(item.quantity));
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      isGuest: !session.userId,
      expiresAt: session.expiresAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      lastCompletedStep: session.lastCompletedStep,
      items: snapshot.items,
      customerInfo: snapshot.customerInfo ?? null,
      shippingAddress: snapshot.shippingAddress ?? null,
      deliveryMethod: snapshot.deliveryMethod ?? null,
      paymentMethod: {
        selected: snapshot.paymentMethod?.provider ?? null,
        availableProviders: ENABLED_PAYMENT_PROVIDERS,
      },
      totals: {
        subtotal: subtotalDec.toFixed(2),
        shippingCharge: snapshot.shippingCharge,
        discount: snapshot.discount,
        tax: snapshot.tax,
        grandTotal: snapshot.grandTotal,
      },
    };
  }

  /**
   * Enforces strict session access control (IDOR prevention)
   */
  async verifySessionAccess(
    session: CheckoutSessionEntity,
    userId?: string,
    secretToken?: string,
  ): Promise<void> {
    // Logged-in session check
    if (session.userId) {
      if (!userId) {
        throw AppError.unauthorized('Authentication required to access this checkout session');
      }
      if (session.userId !== userId) {
        throw AppError.forbidden('Access denied to this checkout session');
      }
    } else {
      // Guest session check
      if (!secretToken) {
        throw AppError.forbidden('Guest session secret token is required');
      }
      const tokenHash = this.hashSecretToken(secretToken);
      if (tokenHash !== session.cartSnapshot.guestSecretTokenHash) {
        throw AppError.forbidden('Invalid session secret token');
      }
    }

    // Expiry check
    if (session.status === 'ACTIVE' && session.expiresAt.getTime() < Date.now()) {
      await this.repo.updateSession(session.id, { status: 'EXPIRED' });
      throw AppError.badRequest('Checkout session has expired. Please initiate a new checkout.');
    }
  }

  /**
   * Touch session to slide expiration window (default 30 mins)
   */
  private async touchSession(session: CheckoutSessionEntity): Promise<CheckoutSessionEntity> {
    if (session.status !== 'ACTIVE') {
      throw AppError.badRequest(`Checkout session is ${session.status.toLowerCase()} and cannot be modified.`);
    }

    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);

    return this.repo.updateSession(session.id, {
      lastActivityAt: now,
      expiresAt: newExpiresAt,
    });
  }

  /**
   * Create Checkout Session from current Cart
   */
  async createSession(params: {
    userId?: string;
    guestToken?: string;
    deviceCategory?: DeviceCategory;
    browser?: string;
    ipAddress?: string;
  }): Promise<{ summary: CheckoutSessionSummaryDto; guestSecretToken?: string }> {
    // 1. Retrieve cart
    const { cart } = await this.cartSvc.getOrCreateCart(params.userId, params.guestToken);

    if (cart.items.length === 0) {
      throw AppError.badRequest('Your cart is empty. Cannot initiate checkout.');
    }

    // 2. Validate cart items live stock & status
    const validation = await this.cartSvc.validateCart(cart.id);
    if (!validation.isValid) {
      const blockers = validation.issues.filter(i => i.issue !== 'PRICE_CHANGED');
      if (blockers.length > 0) {
        throw AppError.badRequest(
          `Cannot initiate checkout: ${blockers.map(b => b.message).join('; ')}`,
        );
      }
    }

    // 3. Expire any existing active session for this cart/user
    const existingActive = await this.repo.findActiveByCartIdOrUserId(cart.id, params.userId);
    if (existingActive) {
      await this.repo.updateSession(existingActive.id, { status: 'EXPIRED' });
    }

    // 4. Calculate initial server snapshot
    let subtotalDec = new Decimal(0);
    const snapshotItems = cart.items.map(item => {
      const price = item.variant?.price ?? item.priceSnapshot;
      const lineTotal = new Decimal(price).times(item.quantity).toFixed(2);
      subtotalDec = subtotalDec.plus(new Decimal(lineTotal));

      return {
        variantId: item.variantId,
        name: item.variant?.name ?? 'Item',
        sku: item.variant?.sku ?? '',
        price: new Decimal(price).toFixed(2),
        quantity: item.quantity,
        lineTotal,
        thumbnailUrl: item.variant?.product.thumbnailUrl ?? null,
      };
    });

    const shippingInfo = await this.shippingCalc.calculateShipping({});
    const discountInfo = await this.couponCalc.calculateDiscount({
      subtotal: subtotalDec.toFixed(2),
      userId: params.userId,
    });
    const tax = '0.00';

    const grandTotalDec = subtotalDec
      .plus(new Decimal(shippingInfo.shippingCharge))
      .minus(new Decimal(discountInfo.discount))
      .plus(new Decimal(tax));

    const sessionId = this.generateSessionId();
    let guestSecretToken: string | undefined;
    let guestSecretTokenHash: string | undefined;

    if (!params.userId) {
      guestSecretToken = this.generateSecretToken();
      guestSecretTokenHash = this.hashSecretToken(guestSecretToken);
    }

    const snapshot: CheckoutCartSnapshot = {
      cartId: cart.id,
      items: snapshotItems,
      guestSecretTokenHash,
      shippingCharge: shippingInfo.shippingCharge,
      discount: discountInfo.discount,
      tax,
      grandTotal: grandTotalDec.toFixed(2),
    };

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);

    const created = await this.repo.createSession({
      sessionId,
      userId: params.userId,
      cartSnapshot: snapshot,
      checkoutValue: grandTotalDec.toNumber(),
      expiresAt,
      deviceCategory: params.deviceCategory ?? 'DESKTOP',
      browser: params.browser,
      ipAddress: params.ipAddress,
    });

    // Auto-record checkout_started event
    await this.repo.recordEvent({
      checkoutSessionId: created.id,
      type: 'CHECKOUT_STARTED',
      metadata: { step: 'initiated', deviceCategory: params.deviceCategory ?? 'DESKTOP' },
    });

    return {
      summary: this.formatSessionSummary(created),
      guestSecretToken,
    };
  }

  /**
   * Get Checkout Session by public ID
   */
  async getSession(
    sessionId: string,
    userId?: string,
    secretToken?: string,
    isRecovered = false,
  ): Promise<CheckoutSessionSummaryDto> {
    const session = await this.repo.findBySessionId(sessionId);
    if (!session) {
      throw AppError.notFound('Checkout session not found');
    }

    await this.verifySessionAccess(session, userId, secretToken);

    if (isRecovered && session.status === 'ABANDONED') {
      await this.repo.updateSession(session.id, {
        status: 'RECOVERED',
        recoveredAt: new Date(),
      });
      session.status = 'RECOVERED';
    }

    const touched = await this.touchSession(session);
    return this.formatSessionSummary(touched);
  }

  /**
   * Update Customer Info (Name, BD Phone, optional Email, recovery consent)
   */
  async updateCustomerInfo(
    sessionId: string,
    info: CheckoutCustomerInfo,
    userId?: string,
    secretToken?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CheckoutSessionSummaryDto> {
    const session = await this.repo.findBySessionId(sessionId);
    if (!session) throw AppError.notFound('Checkout session not found');

    await this.verifySessionAccess(session, userId, secretToken);
    await this.touchSession(session);

    // Explicit consent tracking for recovery contact
    if (info.consentForRecovery) {
      try {
        await prisma.consentRecord.create({
          data: {
            userId: session.userId ?? null,
            guestPhone: !session.userId ? info.phone : null,
            guestEmail: !session.userId ? info.email ?? null : null,
            channel: 'SMS',
            purpose: 'RECOVERY',
            isGranted: true,
            ipAddress,
            userAgent,
          },
        });
      } catch {
        // Safe execution in No-DB / integration mode
      }
    }

    const updatedSnapshot: CheckoutCartSnapshot = {
      ...session.cartSnapshot,
      customerInfo: info,
    };

    const updated = await this.repo.updateSession(session.id, {
      cartSnapshot: updatedSnapshot,
      lastCompletedStep: 'customer_info_entered',
      consentStatus: info.consentForRecovery ? 'GRANTED' : 'DENIED',
    });

    // Auto-record event (strictly no PII in metadata)
    await this.repo.recordEvent({
      checkoutSessionId: session.id,
      type: 'CUSTOMER_INFO_ENTERED',
      metadata: { step: 'customer_info' },
    });

    return this.formatSessionSummary(updated);
  }

  /**
   * Update Shipping Info (Address, District, Area)
   * Re-calculates shipping charge dynamically based on district
   */
  async updateShippingInfo(
    sessionId: string,
    address: CheckoutShippingAddress,
    userId?: string,
    secretToken?: string,
  ): Promise<CheckoutSessionSummaryDto> {
    const session = await this.repo.findBySessionId(sessionId);
    if (!session) throw AppError.notFound('Checkout session not found');

    await this.verifySessionAccess(session, userId, secretToken);
    await this.touchSession(session);

    const shippingResult = await this.shippingCalc.calculateShipping({
      district: address.district,
    });

    address.zoneName = shippingResult.zoneName;

    // Recalculate grand total
    let subtotalDec = new Decimal(0);
    for (const item of session.cartSnapshot.items) {
      subtotalDec = subtotalDec.plus(new Decimal(item.price).times(item.quantity));
    }

    const discountDec = new Decimal(session.cartSnapshot.discount || '0.00');
    const taxDec = new Decimal(session.cartSnapshot.tax || '0.00');
    const shippingDec = new Decimal(shippingResult.shippingCharge);
    const grandTotal = subtotalDec.plus(shippingDec).minus(discountDec).plus(taxDec).toFixed(2);

    const updatedSnapshot: CheckoutCartSnapshot = {
      ...session.cartSnapshot,
      shippingAddress: address,
      shippingCharge: shippingResult.shippingCharge,
      grandTotal,
    };

    const updated = await this.repo.updateSession(session.id, {
      cartSnapshot: updatedSnapshot,
      checkoutValue: Number(grandTotal),
      lastCompletedStep: 'shipping_info_entered',
    });

    await this.repo.recordEvent({
      checkoutSessionId: session.id,
      type: 'SHIPPING_INFO_ENTERED',
      metadata: { step: 'shipping_info' },
    });

    return this.formatSessionSummary(updated);
  }

  /**
   * Update Delivery Method
   */
  async updateDeliveryMethod(
    sessionId: string,
    methodCode: string,
    userId?: string,
    secretToken?: string,
  ): Promise<CheckoutSessionSummaryDto> {
    const session = await this.repo.findBySessionId(sessionId);
    if (!session) throw AppError.notFound('Checkout session not found');

    await this.verifySessionAccess(session, userId, secretToken);
    await this.touchSession(session);

    const district = session.cartSnapshot.shippingAddress?.district;
    const shippingResult = await this.shippingCalc.calculateShipping({
      district,
      deliveryMethodCode: methodCode,
    });

    let subtotalDec = new Decimal(0);
    for (const item of session.cartSnapshot.items) {
      subtotalDec = subtotalDec.plus(new Decimal(item.price).times(item.quantity));
    }

    const discountDec = new Decimal(session.cartSnapshot.discount || '0.00');
    const taxDec = new Decimal(session.cartSnapshot.tax || '0.00');
    const shippingDec = new Decimal(shippingResult.shippingCharge);
    const grandTotal = subtotalDec.plus(shippingDec).minus(discountDec).plus(taxDec).toFixed(2);

    const deliveryMethod: CheckoutDeliveryMethod = {
      code: shippingResult.methodCode,
      name: shippingResult.methodName,
      estimatedDays: shippingResult.estimatedDays,
    };

    const updatedSnapshot: CheckoutCartSnapshot = {
      ...session.cartSnapshot,
      deliveryMethod,
      shippingCharge: shippingResult.shippingCharge,
      grandTotal,
    };

    const updated = await this.repo.updateSession(session.id, {
      cartSnapshot: updatedSnapshot,
      checkoutValue: Number(grandTotal),
      lastCompletedStep: 'delivery_method_selected',
    });

    await this.repo.recordEvent({
      checkoutSessionId: session.id,
      type: 'CHECKOUT_STEP_COMPLETED',
      metadata: { step: 'delivery_method', method: methodCode },
    });

    return this.formatSessionSummary(updated);
  }

  /**
   * Update Payment Method
   */
  async updatePaymentMethod(
    sessionId: string,
    provider: PaymentMethodProvider,
    userId?: string,
    secretToken?: string,
  ): Promise<CheckoutSessionSummaryDto> {
    const session = await this.repo.findBySessionId(sessionId);
    if (!session) throw AppError.notFound('Checkout session not found');

    await this.verifySessionAccess(session, userId, secretToken);
    await this.touchSession(session);

    if (!ENABLED_PAYMENT_PROVIDERS.includes(provider)) {
      throw AppError.badRequest(`Payment provider '${provider}' is not currently supported or enabled.`);
    }

    const updatedSnapshot: CheckoutCartSnapshot = {
      ...session.cartSnapshot,
      paymentMethod: { provider },
    };

    const updated = await this.repo.updateSession(session.id, {
      cartSnapshot: updatedSnapshot,
      lastCompletedStep: 'payment_method_selected',
    });

    await this.repo.recordEvent({
      checkoutSessionId: session.id,
      type: 'PAYMENT_METHOD_SELECTED',
      metadata: { method: provider },
    });

    return this.formatSessionSummary(updated);
  }

  /**
   * Record Client Event with strict allowlist
   */
  async recordClientEvent(
    sessionId: string,
    eventData: { type: string; metadata?: Record<string, unknown> },
    userId?: string,
    secretToken?: string,
  ): Promise<void> {
    const session = await this.repo.findBySessionId(sessionId);
    if (!session) throw AppError.notFound('Checkout session not found');

    await this.verifySessionAccess(session, userId, secretToken);
    await this.touchSession(session);

    const normalizedType = eventData.type.toUpperCase() as CheckoutEventType;

    // Filter metadata to allowlisted keys only (strictly no PII)
    const allowedKeys = ['step', 'method', 'deviceCategory'];
    const sanitizedMetadata: Record<string, unknown> = {};

    if (eventData.metadata) {
      for (const [k, v] of Object.entries(eventData.metadata)) {
        if (allowedKeys.includes(k) && typeof v === 'string') {
          sanitizedMetadata[k] = v;
        }
      }
    }

    await this.repo.recordEvent({
      checkoutSessionId: session.id,
      type: normalizedType,
      metadata: sanitizedMetadata,
    });
  }

  /**
   * Mark session converted to Order (called when Order is placed in M9)
   */
  async markConverted(sessionId: string, orderId: string): Promise<void> {
    const session = await this.repo.findBySessionId(sessionId);
    if (!session) throw AppError.notFound('Checkout session not found');

    const updatedSnapshot: CheckoutCartSnapshot = {
      ...session.cartSnapshot,
      orderId,
    };

    await this.repo.updateSession(session.id, {
      status: 'CONVERTED',
      cartSnapshot: updatedSnapshot,
      lastCompletedStep: 'order_placed',
    });

    await this.repo.recordEvent({
      checkoutSessionId: session.id,
      type: 'ORDER_PLACED',
      metadata: { step: 'order_placed' },
    });
  }

  /**
   * Privacy & Retention: Purge expired checkout PII while retaining metrics
   */
  async purgeExpiredCheckoutPii(olderThan: Date): Promise<number> {
    const cutoff = olderThan;

    try {
      const expiredSessions = await prisma.checkoutSession.findMany({
        where: {
          OR: [
            { expiresAt: { lte: cutoff } },
            { status: { in: ['EXPIRED', 'CONVERTED', 'ABANDONED'] }, updatedAt: { lte: cutoff } },
          ],
        },
      });

      let count = 0;
      for (const s of expiredSessions) {
        const snap = s.cartSnapshot as any;
        if (snap?.customerInfo || snap?.shippingAddress) {
          const anonymizedSnap = {
            ...snap,
            customerInfo: snap.customerInfo
              ? { name: 'Anonymized', phone: '***', email: 'anonymized@local' }
              : undefined,
            shippingAddress: snap.shippingAddress
              ? { ...snap.shippingAddress, address: 'Anonymized Street' }
              : undefined,
          };

          await prisma.checkoutSession.update({
            where: { id: s.id },
            data: { cartSnapshot: anonymizedSnap },
          });
          count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Hook for user account deletion
   */
  async anonymizeCustomerCheckoutPii(userId: string): Promise<void> {
    try {
      const userSessions = await prisma.checkoutSession.findMany({
        where: { userId },
      });

      for (const s of userSessions) {
        const snap = s.cartSnapshot as any;
        const anonymizedSnap = {
          ...snap,
          customerInfo: undefined,
          shippingAddress: undefined,
        };

        await prisma.checkoutSession.update({
          where: { id: s.id },
          data: {
            userId: null,
            cartSnapshot: anonymizedSnap,
          },
        });
      }
    } catch {
      // Safe execution in No-DB mode
    }
  }
}

export const checkoutService = new CheckoutService();
