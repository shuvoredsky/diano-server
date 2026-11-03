import crypto from 'crypto';
import Decimal from 'decimal.js';
import { prisma } from '@/config/database';
import { Prisma } from '@prisma/client';
import { AppError } from '@/utils/app-error';
import { env } from '@/config/env.config';
import { formatInTimeZone } from 'date-fns-tz';
import { defaultShippingCalculator } from '@/modules/checkout/checkout.shipping';
import { inventoryService } from '@/modules/inventory/inventory.service';
import type { CheckoutCartSnapshot } from '@/modules/checkout/checkout.types';
import type {
  OrderEntity,
  OrderItemSnapshot,
  OrderStatusHistoryItem,
  OrderNoteItem,
  OrderPaymentItem,
  CreateOrderInput,
  OrderFilter,
  PaymentProvider,
  OrderStatus,
  PaymentStatus,
  CustomerSnapshot,
  ShippingAddressSnapshot,
  BillingAddressSnapshot,
} from './orders.types';

export type RawOrderRow = {
  id: string;
  orderNumber: string;
  idempotencyKey?: string | null;
  customerId?: string | null;
  status: OrderStatus;
  subtotal: { toString(): string };
  discountTotal: { toString(): string };
  shippingTotal: { toString(): string };
  taxTotal: { toString(): string };
  grandTotal: { toString(): string };
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentProvider;
  shippingAddressSnapshot: unknown;
  billingAddressSnapshot: unknown;
  customerSnapshot: unknown;
  couponId?: string | null;
  notes?: string | null;
  placedAt: Date;
  paymentDeadline?: Date | null;
  confirmedAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: Array<{
    id: string;
    variantId?: string | null;
    productName: string;
    variantName?: string | null;
    sku: string;
    unitPrice: { toString(): string };
    costPrice?: { toString(): string } | null;
    quantity: number;
    discount: { toString(): string };
    lineTotal: { toString(): string };
    attributesSnapshot?: unknown;
  }>;
  statusHistory?: Array<{
    id: string;
    status: OrderStatus;
    changedById?: string | null;
    note?: string | null;
    createdAt: Date;
  }>;
  orderNotes?: Array<{
    id: string;
    authorId?: string | null;
    note: string;
    isCustomerVisible: boolean;
    createdAt: Date;
  }>;
  payments?: Array<{
    id: string;
    provider: PaymentProvider;
    status: PaymentStatus;
    amount: { toString(): string };
    currency: string;
    transactionId?: string | null;
    paidAt?: Date | null;
    createdAt: Date;
  }>;
  invoiceSnapshot?: {
    id: string;
    invoiceNumber: string;
    storeProfile: unknown;
    invoiceSettings: unknown;
    issuedAt: Date;
  } | null;
};

export class OrdersRepository {
  /**
   * Generates collision-safe order number in format DN-YYMMDD-XXXXX (Asia/Dhaka timezone)
   */
  async getNextOrderNumber(tx: Prisma.TransactionClient = prisma): Promise<string> {
    const datePrefix = formatInTimeZone(new Date(), 'Asia/Dhaka', 'yyMMdd');
    const seqKey = `ORDER-${datePrefix}`;

    const seqResult = await tx.$queryRaw<Array<{ lastValue: number }>>`
      INSERT INTO "AppSequence" ("key", "lastValue", "updatedAt")
      VALUES (${seqKey}, 1, NOW())
      ON CONFLICT ("key")
      DO UPDATE SET "lastValue" = "AppSequence"."lastValue" + 1, "updatedAt" = NOW()
      RETURNING "lastValue"
    `;

    const seq = seqResult[0]?.lastValue ?? 1;
    return `DN-${datePrefix}-${String(seq).padStart(5, '0')}`;
  }

  /**
   * Formats raw Prisma Order row to strongly typed OrderEntity
   */
  formatOrder(row: RawOrderRow): OrderEntity {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      idempotencyKey: row.idempotencyKey,
      customerId: row.customerId ?? null,
      status: row.status,
      subtotal: row.subtotal.toString(),
      discountTotal: row.discountTotal.toString(),
      shippingTotal: row.shippingTotal.toString(),
      taxTotal: row.taxTotal.toString(),
      grandTotal: row.grandTotal.toString(),
      paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod,
      shippingAddressSnapshot: (row.shippingAddressSnapshot as unknown as ShippingAddressSnapshot) ?? {
        address: '',
        district: '',
        area: '',
      },
      billingAddressSnapshot: (row.billingAddressSnapshot as unknown as BillingAddressSnapshot | null) ?? null,
      customerSnapshot: (row.customerSnapshot as unknown as CustomerSnapshot) ?? {
        id: '',
        name: '',
        phone: '',
        isGuest: true,
      },
      couponId: row.couponId,
      notes: row.notes,
      placedAt: row.placedAt,
      paymentDeadline: row.paymentDeadline,
      confirmedAt: row.confirmedAt,
      shippedAt: row.shippedAt,
      deliveredAt: row.deliveredAt,
      cancelledAt: row.cancelledAt,
      cancellationReason: row.cancellationReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: (row.items || []).map((item): OrderItemSnapshot => ({
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName || '',
        sku: item.sku,
        unitPrice: item.unitPrice.toString(),
        costPrice: item.costPrice ? item.costPrice.toString() : null,
        quantity: item.quantity,
        discount: item.discount.toString(),
        lineTotal: item.lineTotal.toString(),
        attributesSnapshot: item.attributesSnapshot as Record<string, unknown> | null,
      })),
      statusHistory: (row.statusHistory || []).map((h): OrderStatusHistoryItem => ({
        id: h.id,
        status: h.status,
        changedById: h.changedById,
        note: h.note,
        createdAt: h.createdAt,
      })),
      orderNotes: (row.orderNotes || []).map((n): OrderNoteItem => ({
        id: n.id,
        authorId: n.authorId,
        note: n.note,
        isCustomerVisible: n.isCustomerVisible,
        createdAt: n.createdAt,
      })),
      payments: (row.payments || []).map((p): OrderPaymentItem => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amount: p.amount.toString(),
        currency: p.currency,
        transactionId: p.transactionId,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      invoiceSnapshot: row.invoiceSnapshot
        ? {
            id: row.invoiceSnapshot.id,
            invoiceNumber: row.invoiceSnapshot.invoiceNumber,
            storeProfile: row.invoiceSnapshot.storeProfile as Record<string, unknown>,
            invoiceSettings: row.invoiceSnapshot.invoiceSettings as Record<string, unknown>,
            issuedAt: row.invoiceSnapshot.issuedAt,
          }
        : null,
    };
  }

  async findById(id: string, tx: Prisma.TransactionClient = prisma): Promise<OrderEntity | null> {
    const row = await tx.order.findUnique({
      where: { id },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        orderNotes: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        invoiceSnapshot: true,
      },
    });
    return row ? this.formatOrder(row) : null;
  }

  async findByOrderNumber(orderNumber: string, tx: Prisma.TransactionClient = prisma): Promise<OrderEntity | null> {
    const row = await tx.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        orderNotes: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        invoiceSnapshot: true,
      },
    });
    return row ? this.formatOrder(row) : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    tx: Prisma.TransactionClient = prisma,
  ): Promise<OrderEntity | null> {
    const row = await tx.order.findUnique({
      where: { idempotencyKey },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        orderNotes: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        invoiceSnapshot: true,
      },
    });
    return row ? this.formatOrder(row) : null;
  }

  async listCustomerOrders(
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: OrderEntity[]; total: number }> {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
          payments: true,
        },
      }),
      prisma.order.count({ where: { customerId } }),
    ]);

    return {
      items: rows.map(r => this.formatOrder(r)),
      total,
    };
  }

  async listOrders(filter: OrderFilter): Promise<{ items: OrderEntity[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.paymentStatus) where.paymentStatus = filter.paymentStatus;

    if (filter.dateFrom || filter.dateTo) {
      where.placedAt = {};
      if (filter.dateFrom) where.placedAt.gte = filter.dateFrom;
      if (filter.dateTo) where.placedAt.lte = filter.dateTo;
    }

    if (filter.search) {
      const q = filter.search.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
        { customer: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
          orderNotes: { orderBy: { createdAt: 'desc' } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: rows.map(r => this.formatOrder(r)),
      total,
    };
  }

  /**
   * Executes atomic order creation within a single PostgreSQL transaction
   */
  async createOrderInTransaction(
    input: CreateOrderInput & { payloadHash: string },
  ): Promise<{ order: OrderEntity; isIdempotentReplay: boolean }> {
    try {
      return await prisma.$transaction(
        async tx => {
          // 1. Idempotency verification: check if identical key exists
          const existing = await tx.order.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            include: {
              items: true,
              statusHistory: true,
              orderNotes: true,
              payments: true,
              invoiceSnapshot: true,
            },
          });

          if (existing) {
            const snapshot = existing.customerSnapshot as Record<string, unknown> | null;
            const existingHash = snapshot?.payloadHash;
            if (existingHash && existingHash !== input.payloadHash) {
              throw AppError.conflict('Idempotency key already used with different payload');
            }
            return {
              order: this.formatOrder(existing),
              isIdempotentReplay: true,
            };
          }

          // 2. Session verification & lock check
          const session = await tx.checkoutSession.findUnique({
            where: { id: input.checkoutSessionId },
          });

          if (!session) {
            throw AppError.notFound('Checkout session not found');
          }
          if (session.status === 'CONVERTED') {
            throw AppError.conflict('Checkout session has already been converted to an order');
          }
          if (session.status === 'EXPIRED' || session.expiresAt < new Date()) {
            throw AppError.badRequest('Checkout session has expired');
          }

          const cartSnapshot = session.cartSnapshot as unknown as CheckoutCartSnapshot;
          if (!cartSnapshot || !Array.isArray(cartSnapshot.items) || cartSnapshot.items.length === 0) {
            throw AppError.badRequest('Checkout session contains no items');
          }

          // 3. Resolve warehouse for inventory reservation
          const defaultWarehouse = await tx.warehouse.findFirst({
            where: { isDefault: true, isActive: true },
          });
          const warehouseId = defaultWarehouse?.id || 'WH-DHK-01';

          // 4. Server-Side Recomputation: strictly re-read database pricing and check inventory
          let subtotalDec = new Decimal(0);
          const preparedItems: Array<{
            variantId: string;
            productName: string;
            variantName: string;
            sku: string;
            unitPrice: string;
            costPrice: string | null;
            quantity: number;
            discount: string;
            lineTotal: string;
            attributesSnapshot: Prisma.InputJsonValue;
          }> = [];

          for (const item of cartSnapshot.items) {
            const variant = await tx.productVariant.findUnique({
              where: { id: item.variantId },
              include: { product: true },
            });

            if (!variant || variant.deletedAt || variant.product.deletedAt) {
              throw AppError.badRequest(`Variant '${item.variantId}' is no longer available`);
            }

            const unitPriceDec = new Decimal(variant.price);
            const lineTotalDec = unitPriceDec.times(item.quantity);
            subtotalDec = subtotalDec.plus(lineTotalDec);

            // Stock policy check: READY_STOCK reserves; PRE_ORDER / MADE_TO_ORDER bypass physical stock check
            if (variant.product.inventoryType === 'READY_STOCK') {
              await inventoryService.reserveStock(
                {
                  variantId: variant.id,
                  warehouseId,
                  quantity: item.quantity,
                  referenceType: 'ORDER',
                  referenceId: input.idempotencyKey,
                  actorId: session.userId ?? undefined,
                  reason: `Order reservation for idempotency key ${input.idempotencyKey}`,
                },
                tx,
              );
            }

            preparedItems.push({
              variantId: variant.id,
              productName: variant.product.name,
              variantName: variant.name || variant.sku,
              sku: variant.sku,
              unitPrice: unitPriceDec.toFixed(2),
              costPrice: variant.costPrice ? new Decimal(variant.costPrice).toFixed(2) : null,
              quantity: item.quantity,
              discount: '0.00',
              lineTotal: lineTotalDec.toFixed(2),
              attributesSnapshot: (variant.attributes || {}) as unknown as Prisma.InputJsonValue,
            });
          }

          // 5. Recompute shipping, coupon, tax, and grand total
          const shippingResult = await defaultShippingCalculator.calculateShipping({
            district: cartSnapshot.shippingAddress?.district,
            deliveryMethodCode: cartSnapshot.deliveryMethod?.code,
          });
          const shippingTotalDec = new Decimal(shippingResult.shippingCharge);

          let couponIdToConnect: string | null = null;
          let discountTotalDec = new Decimal('0.00');

          const rawCouponIdentifier =
            (cartSnapshot as unknown as Record<string, unknown>).couponId ||
            (cartSnapshot as unknown as Record<string, unknown>).couponCode;

          if (rawCouponIdentifier) {
            const coupon = await tx.coupon.findFirst({
              where: {
                OR: [
                  { id: String(rawCouponIdentifier) },
                  { code: String(rawCouponIdentifier).trim().toUpperCase() },
                ],
                deletedAt: null,
                isActive: true,
              },
            });

            if (coupon) {
              couponIdToConnect = coupon.id;
              discountTotalDec = new Decimal((cartSnapshot as unknown as Record<string, unknown>).discount?.toString() || '0.00');
            }
          }

          const taxTotalDec = new Decimal('0.00');

          const grandTotalDec = subtotalDec
            .minus(discountTotalDec)
            .plus(shippingTotalDec)
            .plus(taxTotalDec);

          // 6. Resolve customer entity (Registered User vs Guest unactivated user)
          let customerId = session.userId;
          if (!customerId) {
            const customerInfo = cartSnapshot.customerInfo;
            const phone = customerInfo?.phone?.trim();
            const email = customerInfo?.email?.trim();

            let guestUser = phone ? await tx.user.findUnique({ where: { phone } }) : null;
            if (!guestUser && email) {
              guestUser = await tx.user.findUnique({ where: { email } });
            }

            if (!guestUser) {
              const dummySecret = crypto.randomBytes(24).toString('hex');
              guestUser = await tx.user.create({
                data: {
                  name: customerInfo?.name?.trim() || 'Guest Customer',
                  phone: phone || null,
                  email: email || `guest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@diano.local`,
                  passwordHash: dummySecret,
                  status: 'PENDING_VERIFICATION',
                  isEmailVerified: false,
                  isPhoneVerified: false,
                },
              });

              const custRole = await tx.role.findUnique({ where: { slug: 'customer' } });
              if (custRole) {
                await tx.userRole.create({
                  data: {
                    userId: guestUser.id,
                    roleId: custRole.id,
                  },
                });
              }
            }

            customerId = guestUser.id;
          }

          // 7. Generate collision-safe unique order number
          const orderNumber = await this.getNextOrderNumber(tx);

          // 8. Create Order, OrderItems, OrderStatusHistory, and Payment atomically
          const paymentMethod = (cartSnapshot.paymentMethod?.provider as PaymentProvider) || 'COD';

          const createdOrder = await tx.order.create({
            data: {
              orderNumber,
              idempotencyKey: input.idempotencyKey,
              customerId,
              status: 'PENDING',
              subtotal: subtotalDec.toFixed(2),
              discountTotal: discountTotalDec.toFixed(2),
              shippingTotal: shippingTotalDec.toFixed(2),
              taxTotal: taxTotalDec.toFixed(2),
              grandTotal: grandTotalDec.toFixed(2),
              paymentStatus: 'PENDING',
              paymentMethod,
              paymentDeadline: new Date(Date.now() + env.ORDER_PAYMENT_TIMEOUT_HOURS * 60 * 60 * 1000),
              shippingAddressSnapshot: (cartSnapshot.shippingAddress || {
                address: 'Not Provided',
                district: 'Dhaka',
                area: 'Dhaka',
              }) as unknown as Prisma.InputJsonValue,
              customerSnapshot: {
                id: customerId,
                name: cartSnapshot.customerInfo?.name || 'Valued Customer',
                phone: cartSnapshot.customerInfo?.phone || '',
                email: cartSnapshot.customerInfo?.email || null,
                isGuest: !session.userId,
                payloadHash: input.payloadHash,
              } as Prisma.InputJsonValue,
              notes: input.customerNotes || null,
              couponId: couponIdToConnect,
              items: {
                create: preparedItems.map(pi => ({
                  variantId: pi.variantId,
                  productName: pi.productName,
                  variantName: pi.variantName,
                  sku: pi.sku,
                  unitPrice: pi.unitPrice,
                  costPrice: pi.costPrice,
                  quantity: pi.quantity,
                  discount: pi.discount,
                  lineTotal: pi.lineTotal,
                  attributesSnapshot: pi.attributesSnapshot,
                })),
              },
              statusHistory: {
                create: {
                  status: 'PENDING',
                  changedById: customerId,
                  note: 'Order placed',
                },
              },
              payments: {
                create: {
                  provider: paymentMethod,
                  status: 'PENDING',
                  amount: grandTotalDec.toFixed(2),
                  currency: 'BDT',
                },
              },
            },
            include: {
              items: true,
              statusHistory: true,
              orderNotes: true,
              payments: true,
            },
          });

          // Atomic conditional increment of coupon usage
          if (couponIdToConnect) {
            const updated = await tx.$executeRaw`
              UPDATE "Coupon"
              SET "usedCount" = "usedCount" + 1
              WHERE "id" = ${couponIdToConnect} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
            `;
            if (updated === 0) {
              throw AppError.badRequest('Coupon usage limit reached', 'COUPON_EXHAUSTED');
            }

            await tx.couponUsage.create({
              data: {
                couponId: couponIdToConnect,
                orderId: createdOrder.id,
                userId: customerId,
                discountAmount: discountTotalDec.toFixed(2),
              },
            });
          }

          // 9. Mark checkout session as CONVERTED and emit checkout event
          await tx.checkoutSession.update({
            where: { id: session.id },
            data: {
              status: 'CONVERTED',
              lastCompletedStep: 'order_placed',
              cartSnapshot: {
                ...cartSnapshot,
                orderId: createdOrder.id,
              } as unknown as Prisma.InputJsonValue,
            },
          });

          await tx.checkoutEvent.create({
            data: {
              checkoutSessionId: session.id,
              type: 'ORDER_PLACED',
              metadata: {
                orderId: createdOrder.id,
                orderNumber: createdOrder.orderNumber,
              },
            },
          });

          return {
            order: this.formatOrder(createdOrder),
            isIdempotentReplay: false,
          };
        },
        { timeout: 35000, maxWait: 15000 },
      );
    } catch (err: unknown) {
      // Handle unique constraint collision on idempotencyKey gracefully
      const errObj = err as { code?: string; message?: string; meta?: { target?: unknown } };
      const isUniqueCollision =
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') ||
        (errObj?.code === 'P2002' || errObj?.message?.includes('Unique constraint failed'));

      if (isUniqueCollision && (errObj?.message?.includes('idempotencyKey') || errObj?.message?.includes('Order_idempotencyKey_key') || String(errObj?.meta?.target || '').includes('idempotencyKey'))) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const existing = await this.findByIdempotencyKey(input.idempotencyKey);
          if (existing) {
            const snapshot = existing.customerSnapshot as unknown as Record<string, unknown> | null;
            const existingHash = snapshot?.payloadHash;
            if (existingHash && existingHash !== input.payloadHash) {
              throw AppError.conflict('Idempotency key already used with different payload');
            }
            return {
              order: existing,
              isIdempotentReplay: true,
            };
          }
          await new Promise(r => setTimeout(r, 60));
        }
      }
      throw err;
    }
  }

  async addOrderNote(
    orderId: string,
    note: string,
    authorId?: string,
    isCustomerVisible = false,
  ): Promise<OrderNoteItem> {
    const row = await prisma.orderNote.create({
      data: {
        orderId,
        authorId,
        note,
        isCustomerVisible,
      },
    });

    return {
      id: row.id,
      authorId: row.authorId,
      note: row.note,
      isCustomerVisible: row.isCustomerVisible,
      createdAt: row.createdAt,
    };
  }
}

export const ordersRepository = new OrdersRepository();
