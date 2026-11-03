import { prisma } from '@/config/database';
import Decimal from 'decimal.js';
import type {
  ChartType,
  ProductPerformanceItem,
  ReturnedProductItem,
  DeadStockItem,
  CustomerSpendItem,
  DistrictBreakdownItem,
  ExpenseByCategory,
} from './analytics.types';

export interface OverviewMetricsRaw {
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  totalOrders: number;
  cancelledOrders: number;
  cancellationRate: number;
  aov: number;
  itemsSold: number;
  returnedOrders: number;
  returnRate: number;
  customerCount: number;
  repeatCustomerRate: number;
  undeliveredOrdersCount: number;
  cogs: number;
  cogsCoverage: number;
  isCogsComplete: boolean;
  grossProfit: number | null;
  expenses: number;
  paymentFees: number;
  netProfit: number | null;
}

export interface IAnalyticsRepository {
  getOverviewMetrics(start: Date, end: Date): Promise<OverviewMetricsRaw>;
  getRevenueMetrics(
    start: Date,
    end: Date,
  ): Promise<{
    grossSales: number;
    discounts: {
      total: number;
      itemDiscounts: number;
      couponDiscounts: number;
      flashSaleDiscounts: number;
    };
    refunds: number;
    shippingRevenue: number;
    taxRevenue: number;
    netSales: number;
    cogs: number;
    cogsCoverage: number;
    isCogsComplete: boolean;
    grossProfit: number | null;
    grossProfitMargin: number | null;
    expensesTotal: number;
    expensesByCategory: ExpenseByCategory[];
    paymentFees: number;
    netProfit: number | null;
    netProfitMargin: number | null;
  }>;
  getOrdersMetrics(
    start: Date,
    end: Date,
  ): Promise<{
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    cancellationRatePercent: number;
    returnedOrders: number;
    returnRatePercent: number;
    avgFulfillmentTimeHours: number | null;
    statusBreakdown: Array<{ status: string; count: number; percent: number }>;
    paymentMethodBreakdown: Array<{ method: string; count: number; totalAmount: number }>;
  }>;
  getProductsMetrics(
    start: Date,
    end: Date,
  ): Promise<{
    top10SellingByQty: ProductPerformanceItem[];
    top10SellingByRevenue: ProductPerformanceItem[];
    worst5Selling: ProductPerformanceItem[];
    topReturnedProducts: ReturnedProductItem[];
    deadStock: DeadStockItem[];
  }>;
  getInventoryMetrics(): Promise<{
    totalInventoryValuation: number;
    totalStockUnits: number;
    outOfStockCount: number;
    lowStockCount: number;
    turnoverRateEstimate: number | null;
  }>;
  getCustomersMetrics(
    start: Date,
    end: Date,
  ): Promise<{
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    repeatCustomerRatePercent: number;
    avgCustomerLifetimeValue: number;
    top10CustomersBySpend: CustomerSpendItem[];
    geographicBreakdown: DistrictBreakdownItem[];
  }>;
  getPaymentsMetrics(
    start: Date,
    end: Date,
  ): Promise<{
    methodBreakdown: Array<{ method: string; count: number; totalAmount: number }>;
    successRatePercent: number;
    totalGatewayFees: number;
    pendingCodCollections: number;
  }>;
  getFunnelMetrics(
    start: Date,
    end: Date,
  ): Promise<{
    sessionsInitiated: number;
    ordersPlaced: number;
    ordersDelivered: number;
  }>;
  getChartData(
    type: ChartType,
    start: Date,
    end: Date,
    bucketType: 'hour' | 'day' | 'month',
  ): Promise<Array<{ bucket: string; [key: string]: unknown }>>;
}

export class AnalyticsRepository implements IAnalyticsRepository {
  async getOverviewMetrics(start: Date, end: Date): Promise<OverviewMetricsRaw> {
    // 1. Order metrics for included orders (CONFIRMED+) and cancelled orders
    const orderAgg = await prisma.$queryRaw<
      Array<{
        gross_sales: string | null;
        discount_total: string | null;
        total_orders: bigint;
        cancelled_orders: bigint;
        included_orders: bigint;
        undelivered_orders: bigint;
      }>
    >`
      SELECT
        COALESCE(SUM(CASE WHEN o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED') THEN o.subtotal ELSE 0 END), 0)::text as gross_sales,
        COALESCE(SUM(CASE WHEN o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED') THEN o."discountTotal" ELSE 0 END), 0)::text as discount_total,
        COUNT(o.id) as total_orders,
        COUNT(CASE WHEN o.status = 'CANCELLED' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED') THEN 1 END) as included_orders,
        COUNT(CASE WHEN o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED') THEN 1 END) as undelivered_orders
      FROM "Order" o
      WHERE o."placedAt" >= ${start} AND o."placedAt" < ${end}
    `;

    const row = orderAgg[0];
    const grossSalesDec = new Decimal(row?.gross_sales || '0');
    const discountTotalDec = new Decimal(row?.discount_total || '0');
    const totalOrders = Number(row?.total_orders || 0n);
    const cancelledOrders = Number(row?.cancelled_orders || 0n);
    const includedOrders = Number(row?.included_orders || 0n);
    const undeliveredOrdersCount = Number(row?.undelivered_orders || 0n);

    const cancellationRate =
      totalOrders > 0
        ? Math.round((cancelledOrders / totalOrders) * 10000) / 100
        : 0;

    // 2. Refunds completed in period
    const refundAgg = await prisma.$queryRaw<Array<{ total_refunds: string | null }>>`
      SELECT COALESCE(SUM(amount), 0)::text as total_refunds
      FROM "Refund"
      WHERE status = 'COMPLETED' AND "completedAt" >= ${start} AND "completedAt" < ${end}
    `;
    const refundsDec = new Decimal(refundAgg[0]?.total_refunds || '0');

    // Net sales = grossSales - discounts - refunds
    const netSalesDec = grossSalesDec.minus(discountTotalDec).minus(refundsDec);

    const aov =
      includedOrders > 0
        ? Number(netSalesDec.dividedBy(includedOrders).toFixed(2))
        : 0;

    // 3. Items sold
    const itemsSoldAgg = await prisma.$queryRaw<Array<{ total_qty: bigint | null }>>`
      SELECT COALESCE(SUM(oi.quantity), 0) as total_qty
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
        AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
    `;
    const itemsSold = Number(itemsSoldAgg[0]?.total_qty || 0n);

    // 4. Return rate
    const returnAgg = await prisma.$queryRaw<
      Array<{ returned_orders: bigint }>
    >`
      SELECT COUNT(DISTINCT rr."orderId") as returned_orders
      FROM "ReturnRequest" rr
      JOIN "Order" o ON rr."orderId" = o.id
      WHERE o."placedAt" >= ${start} AND o."placedAt" < ${end}
    `;
    const returnedOrders = Number(returnAgg[0]?.returned_orders || 0n);
    const returnRate =
      includedOrders > 0
        ? Math.round((returnedOrders / includedOrders) * 10000) / 100
        : 0;

    // 5. Unique customers & repeat customers in period
    const customerAgg = await prisma.$queryRaw<
      Array<{
        unique_customers: bigint;
        repeat_customers: bigint;
      }>
    >`
      WITH customer_orders AS (
        SELECT o."customerId",
               COUNT(o.id) as period_order_count,
               (SELECT COUNT(o2.id) FROM "Order" o2 WHERE o2."customerId" = o."customerId" AND o2.status != 'CANCELLED') as lifetime_order_count
        FROM "Order" o
        WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
          AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
        GROUP BY o."customerId"
      )
      SELECT
        COUNT("customerId") as unique_customers,
        COUNT(CASE WHEN lifetime_order_count > 1 THEN 1 END) as repeat_customers
      FROM customer_orders
    `;
    const customerCount = Number(customerAgg[0]?.unique_customers || 0n);
    const repeatCustomers = Number(customerAgg[0]?.repeat_customers || 0n);
    const repeatCustomerRate =
      customerCount > 0
        ? Math.round((repeatCustomers / customerCount) * 10000) / 100
        : 0;

    // 6. COGS and strict coverage check
    const cogsAgg = await prisma.$queryRaw<
      Array<{
        total_items: bigint;
        items_with_cost: bigint;
        cogs_sum: string | null;
      }>
    >`
      SELECT
        COUNT(oi.id) as total_items,
        COUNT(CASE WHEN oi."costPrice" IS NOT NULL AND oi."costPrice" > 0 THEN 1 END) as items_with_cost,
        COALESCE(SUM(CASE WHEN oi."costPrice" IS NOT NULL THEN oi."costPrice" * oi.quantity ELSE 0 END), 0)::text as cogs_sum
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
        AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
    `;
    const totalOrderItems = Number(cogsAgg[0]?.total_items || 0n);
    const itemsWithCost = Number(cogsAgg[0]?.items_with_cost || 0n);
    const cogsDec = new Decimal(cogsAgg[0]?.cogs_sum || '0');

    const cogsCoverage =
      totalOrderItems === 0
        ? 100
        : Math.round((itemsWithCost / totalOrderItems) * 10000) / 100;
    const isCogsComplete = totalOrderItems === 0 || itemsWithCost === totalOrderItems;

    const grossProfitDec = isCogsComplete ? netSalesDec.minus(cogsDec) : null;

    // 7. Expenses
    const expenseAgg = await prisma.$queryRaw<Array<{ total_expense: string | null }>>`
      SELECT COALESCE(SUM(amount), 0)::text as total_expense
      FROM "Expense"
      WHERE date >= ${start} AND date < ${end}
    `;
    const expensesDec = new Decimal(expenseAgg[0]?.total_expense || '0');

    // 8. Payment fees
    const feesAgg = await prisma.$queryRaw<Array<{ total_fees: string | null }>>`
      SELECT COALESCE(SUM("paymentFee"), 0)::text as total_fees
      FROM "Payment"
      WHERE status = 'PAID' AND "paidAt" >= ${start} AND "paidAt" < ${end}
    `;
    const paymentFeesDec = new Decimal(feesAgg[0]?.total_fees || '0');

    const netProfitDec =
      grossProfitDec !== null
        ? grossProfitDec.minus(expensesDec).minus(paymentFeesDec)
        : null;

    return {
      grossSales: grossSalesDec.toNumber(),
      discounts: discountTotalDec.toNumber(),
      refunds: refundsDec.toNumber(),
      netSales: netSalesDec.toNumber(),
      totalOrders,
      cancelledOrders,
      cancellationRate,
      aov,
      itemsSold,
      returnedOrders,
      returnRate,
      customerCount,
      repeatCustomerRate,
      undeliveredOrdersCount,
      cogs: cogsDec.toNumber(),
      cogsCoverage,
      isCogsComplete,
      grossProfit: grossProfitDec !== null ? grossProfitDec.toNumber() : null,
      expenses: expensesDec.toNumber(),
      paymentFees: paymentFeesDec.toNumber(),
      netProfit: netProfitDec !== null ? netProfitDec.toNumber() : null,
    };
  }

  async getRevenueMetrics(start: Date, end: Date) {
    const [revAgg, couponAgg, refundAgg, expenseTotalAgg, expenseCategoryAgg, feesAgg] =
      await Promise.all([
        prisma.$queryRaw<
          Array<{
            gross_sales: string | null;
            item_discounts: string | null;
            discount_total: string | null;
            shipping_total: string | null;
            tax_total: string | null;
            cogs_sum: string | null;
            total_items: bigint;
            items_with_cost: bigint;
          }>
        >`
          SELECT
            COALESCE(SUM(o.subtotal), 0)::text as gross_sales,
            COALESCE(SUM(items_sub.item_disc), 0)::text as item_discounts,
            COALESCE(SUM(o."discountTotal"), 0)::text as discount_total,
            COALESCE(SUM(o."shippingTotal"), 0)::text as shipping_total,
            COALESCE(SUM(o."taxTotal"), 0)::text as tax_total,
            COALESCE(SUM(items_sub.cogs), 0)::text as cogs_sum,
            COALESCE(SUM(items_sub.item_count), 0) as total_items,
            COALESCE(SUM(items_sub.cost_count), 0) as items_with_cost
          FROM "Order" o
          LEFT JOIN (
            SELECT
              "orderId",
              SUM(discount) as item_disc,
              SUM(CASE WHEN "costPrice" IS NOT NULL THEN "costPrice" * quantity ELSE 0 END) as cogs,
              COUNT(id) as item_count,
              COUNT(CASE WHEN "costPrice" IS NOT NULL AND "costPrice" > 0 THEN 1 END) as cost_count
            FROM "OrderItem"
            GROUP BY "orderId"
          ) items_sub ON o.id = items_sub."orderId"
          WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
        `,
        prisma.$queryRaw<Array<{ coupon_discounts: string | null }>>`
          SELECT COALESCE(SUM(cu."discountAmount"), 0)::text as coupon_discounts
          FROM "CouponUsage" cu
          JOIN "Order" o ON cu."orderId" = o.id
          WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
        `,
        prisma.$queryRaw<Array<{ total_refunds: string | null }>>`
          SELECT COALESCE(SUM(amount), 0)::text as total_refunds
          FROM "Refund"
          WHERE status = 'COMPLETED' AND "completedAt" >= ${start} AND "completedAt" < ${end}
        `,
        prisma.$queryRaw<Array<{ total_expense: string | null }>>`
          SELECT COALESCE(SUM(amount), 0)::text as total_expense
          FROM "Expense"
          WHERE date >= ${start} AND date < ${end}
        `,
        prisma.$queryRaw<Array<{ category: string; amount: string }>>`
          SELECT category::text, SUM(amount)::text as amount
          FROM "Expense"
          WHERE date >= ${start} AND date < ${end}
          GROUP BY category
          ORDER BY SUM(amount) DESC
        `,
        prisma.$queryRaw<Array<{ total_fees: string | null }>>`
          SELECT COALESCE(SUM("paymentFee"), 0)::text as total_fees
          FROM "Payment"
          WHERE status = 'PAID' AND "paidAt" >= ${start} AND "paidAt" < ${end}
        `,
      ]);

    const r = revAgg[0];
    const grossSalesDec = new Decimal(r?.gross_sales || '0');
    const discountTotalDec = new Decimal(r?.discount_total || '0');
    const itemDiscountsDec = new Decimal(r?.item_discounts || '0');
    const couponDiscountsDec = new Decimal(couponAgg[0]?.coupon_discounts || '0');
    const flashSaleDiscountsDec = Decimal.max(
      0,
      discountTotalDec.minus(itemDiscountsDec).minus(couponDiscountsDec),
    );

    const refundsDec = new Decimal(refundAgg[0]?.total_refunds || '0');
    const shippingRevDec = new Decimal(r?.shipping_total || '0');
    const taxRevDec = new Decimal(r?.tax_total || '0');
    const netSalesDec = grossSalesDec.minus(discountTotalDec).minus(refundsDec);

    const totalItems = Number(r?.total_items || 0n);
    const itemsWithCost = Number(r?.items_with_cost || 0n);
    const cogsDec = new Decimal(r?.cogs_sum || '0');
    const cogsCoverage =
      totalItems === 0 ? 100 : Math.round((itemsWithCost / totalItems) * 10000) / 100;
    const isCogsComplete = totalItems === 0 || itemsWithCost === totalItems;

    const grossProfitDec = isCogsComplete ? netSalesDec.minus(cogsDec) : null;
    const grossProfitMargin =
      grossProfitDec !== null && !netSalesDec.isZero()
        ? Math.round(grossProfitDec.dividedBy(netSalesDec).toNumber() * 10000) / 100
        : null;

    const expensesTotalDec = new Decimal(expenseTotalAgg[0]?.total_expense || '0');
    const paymentFeesDec = new Decimal(feesAgg[0]?.total_fees || '0');

    const netProfitDec =
      grossProfitDec !== null
        ? grossProfitDec.minus(expensesTotalDec).minus(paymentFeesDec)
        : null;
    const netProfitMargin =
      netProfitDec !== null && !netSalesDec.isZero()
        ? Math.round(netProfitDec.dividedBy(netSalesDec).toNumber() * 10000) / 100
        : null;

    return {
      grossSales: grossSalesDec.toNumber(),
      discounts: {
        total: discountTotalDec.toNumber(),
        itemDiscounts: itemDiscountsDec.toNumber(),
        couponDiscounts: couponDiscountsDec.toNumber(),
        flashSaleDiscounts: flashSaleDiscountsDec.toNumber(),
      },
      refunds: refundsDec.toNumber(),
      shippingRevenue: shippingRevDec.toNumber(),
      taxRevenue: taxRevDec.toNumber(),
      netSales: netSalesDec.toNumber(),
      cogs: cogsDec.toNumber(),
      cogsCoverage,
      isCogsComplete,
      grossProfit: grossProfitDec !== null ? grossProfitDec.toNumber() : null,
      grossProfitMargin,
      expensesTotal: expensesTotalDec.toNumber(),
      expensesByCategory: expenseCategoryAgg.map(e => ({
        category: e.category,
        amount: Number(new Decimal(e.amount).toFixed(2)),
      })),
      paymentFees: paymentFeesDec.toNumber(),
      netProfit: netProfitDec !== null ? netProfitDec.toNumber() : null,
      netProfitMargin,
    };
  }

  async getOrdersMetrics(start: Date, end: Date) {
    const [orderSummary, statusRows, paymentRows, fulfillmentAgg, returnAgg] =
      await Promise.all([
        prisma.$queryRaw<
          Array<{
            total_orders: bigint;
            completed_orders: bigint;
            cancelled_orders: bigint;
          }>
        >`
          SELECT
            COUNT(id) as total_orders,
            COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) as completed_orders,
            COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders
          FROM "Order"
          WHERE "placedAt" >= ${start} AND "placedAt" < ${end}
        `,
        prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
          SELECT status::text, COUNT(id) as count
          FROM "Order"
          WHERE "placedAt" >= ${start} AND "placedAt" < ${end}
          GROUP BY status
          ORDER BY count DESC
        `,
        prisma.$queryRaw<Array<{ method: string; count: bigint; total_amount: string | null }>>`
          SELECT
            "paymentMethod"::text as method,
            COUNT(id) as count,
            COALESCE(SUM("grandTotal"), 0)::text as total_amount
          FROM "Order"
          WHERE status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND "placedAt" >= ${start} AND "placedAt" < ${end}
          GROUP BY "paymentMethod"
          ORDER BY count DESC
        `,
        prisma.$queryRaw<Array<{ avg_hours: number | null }>>`
          SELECT AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "placedAt")) / 3600)::float as avg_hours
          FROM "Order"
          WHERE status = 'DELIVERED' AND "deliveredAt" IS NOT NULL
            AND "placedAt" >= ${start} AND "placedAt" < ${end}
        `,
        prisma.$queryRaw<Array<{ returned_count: bigint }>>`
          SELECT COUNT(DISTINCT rr."orderId") as returned_count
          FROM "ReturnRequest" rr
          JOIN "Order" o ON rr."orderId" = o.id
          WHERE o."placedAt" >= ${start} AND o."placedAt" < ${end}
        `,
      ]);

    const totalOrders = Number(orderSummary[0]?.total_orders || 0n);
    const completedOrders = Number(orderSummary[0]?.completed_orders || 0n);
    const cancelledOrders = Number(orderSummary[0]?.cancelled_orders || 0n);
    const returnedOrders = Number(returnAgg[0]?.returned_count || 0n);

    const cancellationRatePercent =
      totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 10000) / 100 : 0;
    const returnRatePercent =
      totalOrders > 0 ? Math.round((returnedOrders / totalOrders) * 10000) / 100 : 0;

    const statusBreakdown = statusRows.map(r => {
      const count = Number(r.count);
      return {
        status: r.status,
        count,
        percent: totalOrders > 0 ? Math.round((count / totalOrders) * 10000) / 100 : 0,
      };
    });

    const paymentMethodBreakdown = paymentRows.map(r => ({
      method: r.method,
      count: Number(r.count),
      totalAmount: Number(new Decimal(r.total_amount || '0').toFixed(2)),
    }));

    const avgHours = fulfillmentAgg[0]?.avg_hours;

    return {
      totalOrders,
      completedOrders,
      cancelledOrders,
      cancellationRatePercent,
      returnedOrders,
      returnRatePercent,
      avgFulfillmentTimeHours: avgHours !== null && avgHours !== undefined ? Math.round(avgHours * 10) / 10 : null,
      statusBreakdown,
      paymentMethodBreakdown,
    };
  }

  async getProductsMetrics(start: Date, end: Date) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [topQty, topRev, worstQty, topReturns, deadStockRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          productId: string;
          variantId: string;
          productName: string;
          sku: string;
          quantitySold: bigint;
          revenue: string;
        }>
      >`
        SELECT
          pv."productId",
          pv.id as "variantId",
          pv.name as "productName",
          pv.sku,
          SUM(oi.quantity) as "quantitySold",
          SUM(oi."lineTotal")::text as revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON oi."orderId" = o.id
        JOIN "ProductVariant" pv ON oi."variantId" = pv.id
        WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
          AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
        GROUP BY pv."productId", pv.id, pv.name, pv.sku
        ORDER BY "quantitySold" DESC
        LIMIT 10
      `,
      prisma.$queryRaw<
        Array<{
          productId: string;
          variantId: string;
          productName: string;
          sku: string;
          quantitySold: bigint;
          revenue: string;
        }>
      >`
        SELECT
          pv."productId",
          pv.id as "variantId",
          pv.name as "productName",
          pv.sku,
          SUM(oi.quantity) as "quantitySold",
          SUM(oi."lineTotal")::text as revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON oi."orderId" = o.id
        JOIN "ProductVariant" pv ON oi."variantId" = pv.id
        WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
          AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
        GROUP BY pv."productId", pv.id, pv.name, pv.sku
        ORDER BY SUM(oi."lineTotal") DESC
        LIMIT 10
      `,
      prisma.$queryRaw<
        Array<{
          productId: string;
          variantId: string;
          productName: string;
          sku: string;
          quantitySold: bigint;
          revenue: string;
        }>
      >`
        SELECT
          pv."productId",
          pv.id as "variantId",
          pv.name as "productName",
          pv.sku,
          SUM(oi.quantity) as "quantitySold",
          SUM(oi."lineTotal")::text as revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON oi."orderId" = o.id
        JOIN "ProductVariant" pv ON oi."variantId" = pv.id
        WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
          AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
        GROUP BY pv."productId", pv.id, pv.name, pv.sku
        ORDER BY "quantitySold" ASC
        LIMIT 5
      `,
      prisma.$queryRaw<
        Array<{
          productId: string;
          productName: string;
          sku: string;
          returnCount: bigint;
          totalSold: bigint;
        }>
      >`
        SELECT
          pv."productId",
          pv.name as "productName",
          pv.sku,
          COUNT(ri.id) as "returnCount",
          COALESCE(SUM(oi.quantity), 0) as "totalSold"
        FROM "ReturnItem" ri
        JOIN "OrderItem" oi ON ri."orderItemId" = oi.id
        JOIN "ProductVariant" pv ON oi."variantId" = pv.id
        JOIN "Order" o ON oi."orderId" = o.id
        WHERE o."placedAt" >= ${start} AND o."placedAt" < ${end}
        GROUP BY pv."productId", pv.name, pv.sku
        ORDER BY "returnCount" DESC
        LIMIT 10
      `,
      prisma.$queryRaw<
        Array<{
          productId: string;
          variantId: string;
          productName: string;
          sku: string;
          stock: bigint;
          lastSoldAt: Date | null;
        }>
      >`
        SELECT
          pv."productId",
          pv.id as "variantId",
          pv.name as "productName",
          pv.sku,
          COALESCE(SUM(inv."onHand"), 0) as stock,
          MAX(o."placedAt") as "lastSoldAt"
        FROM "ProductVariant" pv
        LEFT JOIN "Inventory" inv ON pv.id = inv."variantId"
        LEFT JOIN "OrderItem" oi ON pv.id = oi."variantId"
        LEFT JOIN "Order" o ON oi."orderId" = o.id AND o.status != 'CANCELLED'
        WHERE pv."deletedAt" IS NULL AND pv."isActive" = true
        GROUP BY pv."productId", pv.id, pv.name, pv.sku
        HAVING COALESCE(SUM(inv."onHand"), 0) > 0
           AND (MAX(o."placedAt") IS NULL OR MAX(o."placedAt") < ${thirtyDaysAgo})
        ORDER BY stock DESC
        LIMIT 20
      `,
    ]);

    const mapProductItem = (r: {
      productId: string;
      variantId?: string;
      productName: string;
      sku: string;
      quantitySold: bigint;
      revenue: string;
    }): ProductPerformanceItem => ({
      productId: r.productId,
      variantId: r.variantId,
      productName: r.productName,
      sku: r.sku,
      quantitySold: Number(r.quantitySold),
      revenue: Number(new Decimal(r.revenue).toFixed(2)),
    });

    const topReturnedProducts: ReturnedProductItem[] = topReturns.map(r => {
      const returnCount = Number(r.returnCount);
      const totalSold = Number(r.totalSold);
      return {
        productId: r.productId,
        productName: r.productName,
        sku: r.sku,
        returnCount,
        returnRatePercent:
          totalSold > 0 ? Math.round((returnCount / totalSold) * 10000) / 100 : 0,
      };
    });

    const deadStock: DeadStockItem[] = deadStockRows.map(r => ({
      productId: r.productId,
      variantId: r.variantId,
      productName: r.productName,
      sku: r.sku,
      stock: Number(r.stock),
      lastSoldAt: r.lastSoldAt ? r.lastSoldAt.toISOString() : null,
    }));

    return {
      top10SellingByQty: topQty.map(mapProductItem),
      top10SellingByRevenue: topRev.map(mapProductItem),
      worst5Selling: worstQty.map(mapProductItem),
      topReturnedProducts,
      deadStock,
    };
  }

  async getInventoryMetrics() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [valuationAgg, stockCounts, soldLast30Agg] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          total_valuation: string | null;
          total_units: bigint | null;
        }>
      >`
        SELECT
          COALESCE(SUM(inv."onHand" * COALESCE(pv."costPrice", 0)), 0)::text as total_valuation,
          COALESCE(SUM(inv."onHand"), 0) as total_units
        FROM "Inventory" inv
        JOIN "ProductVariant" pv ON inv."variantId" = pv.id
        WHERE pv."deletedAt" IS NULL AND pv."isActive" = true
      `,
      prisma.$queryRaw<
        Array<{
          out_of_stock: bigint;
          low_stock: bigint;
        }>
      >`
        WITH variant_stock AS (
          SELECT
            pv.id,
            pv."reorderLevel",
            COALESCE(SUM(inv."onHand"), 0) as total_on_hand
          FROM "ProductVariant" pv
          LEFT JOIN "Inventory" inv ON pv.id = inv."variantId"
          WHERE pv."deletedAt" IS NULL AND pv."isActive" = true
          GROUP BY pv.id, pv."reorderLevel"
        )
        SELECT
          COUNT(CASE WHEN total_on_hand <= 0 THEN 1 END) as out_of_stock,
          COUNT(CASE WHEN total_on_hand > 0 AND total_on_hand <= "reorderLevel" THEN 1 END) as low_stock
        FROM variant_stock
      `,
      prisma.$queryRaw<Array<{ units_sold_30d: bigint | null }>>`
        SELECT COALESCE(SUM(oi.quantity), 0) as units_sold_30d
        FROM "OrderItem" oi
        JOIN "Order" o ON oi."orderId" = o.id
        WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
          AND o."placedAt" >= ${thirtyDaysAgo}
      `,
    ]);

    const totalValuation = Number(
      new Decimal(valuationAgg[0]?.total_valuation || '0').toFixed(2),
    );
    const totalStockUnits = Number(valuationAgg[0]?.total_units || 0n);
    const outOfStockCount = Number(stockCounts[0]?.out_of_stock || 0n);
    const lowStockCount = Number(stockCounts[0]?.low_stock || 0n);
    const unitsSold30d = Number(soldLast30Agg[0]?.units_sold_30d || 0n);

    // Turnover estimate annualized = (units_sold_30d / average_stock) * (365 / 30)
    const turnoverRateEstimate =
      totalStockUnits > 0
        ? Math.round((unitsSold30d / totalStockUnits) * 12.16 * 100) / 100
        : null;

    return {
      totalInventoryValuation: totalValuation,
      totalStockUnits,
      outOfStockCount,
      lowStockCount,
      turnoverRateEstimate,
    };
  }

  async getCustomersMetrics(start: Date, end: Date) {
    const [customerAgg, topSpend, districtAgg] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          total_customers: bigint;
          new_customers: bigint;
          returning_customers: bigint;
        }>
      >`
        WITH customer_stats AS (
          SELECT
            o."customerId",
            MIN(o_all."placedAt") as first_order_date
          FROM "Order" o
          JOIN "Order" o_all ON o."customerId" = o_all."customerId" AND o_all.status != 'CANCELLED'
          WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          GROUP BY o."customerId"
        )
        SELECT
          COUNT("customerId") as total_customers,
          COUNT(CASE WHEN first_order_date >= ${start} AND first_order_date < ${end} THEN 1 END) as new_customers,
          COUNT(CASE WHEN first_order_date < ${start} THEN 1 END) as returning_customers
        FROM customer_stats
      `,
      prisma.$queryRaw<
        Array<{
          customerId: string;
          fullName: string;
          email: string;
          orderCount: bigint;
          totalSpend: string;
        }>
      >`
        SELECT
          o."customerId",
          u.name as "fullName",
          u.email,
          COUNT(o.id) as "orderCount",
          SUM(o."grandTotal")::text as "totalSpend"
        FROM "Order" o
        JOIN "User" u ON o."customerId" = u.id
        WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
          AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
        GROUP BY o."customerId", u.name, u.email
        ORDER BY SUM(o."grandTotal") DESC
        LIMIT 10
      `,
      prisma.$queryRaw<
        Array<{
          district: string | null;
          orderCount: bigint;
          totalRevenue: string;
        }>
      >`
        SELECT
          COALESCE(o."shippingAddressSnapshot"->>'district', 'Unknown') as district,
          COUNT(o.id) as "orderCount",
          SUM(o."grandTotal")::text as "totalRevenue"
        FROM "Order" o
        WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
          AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
        GROUP BY COALESCE(o."shippingAddressSnapshot"->>'district', 'Unknown')
        ORDER BY SUM(o."grandTotal") DESC
      `,
    ]);

    const totalCustomers = Number(customerAgg[0]?.total_customers || 0n);
    const newCustomers = Number(customerAgg[0]?.new_customers || 0n);
    const returningCustomers = Number(customerAgg[0]?.returning_customers || 0n);
    const repeatCustomerRatePercent =
      totalCustomers > 0
        ? Math.round((returningCustomers / totalCustomers) * 10000) / 100
        : 0;

    const top10CustomersBySpend: CustomerSpendItem[] = topSpend.map(r => ({
      customerId: r.customerId,
      fullName: r.fullName,
      email: r.email,
      orderCount: Number(r.orderCount),
      totalSpend: Number(new Decimal(r.totalSpend).toFixed(2)),
    }));

    const totalSpendOfTop = top10CustomersBySpend.reduce((acc, c) => acc + c.totalSpend, 0);
    const avgCustomerLifetimeValue =
      top10CustomersBySpend.length > 0
        ? Math.round((totalSpendOfTop / top10CustomersBySpend.length) * 100) / 100
        : 0;

    const geographicBreakdown: DistrictBreakdownItem[] = districtAgg.map(r => ({
      district: r.district || 'Unknown',
      orderCount: Number(r.orderCount),
      totalRevenue: Number(new Decimal(r.totalRevenue).toFixed(2)),
    }));

    return {
      totalCustomers,
      newCustomers,
      returningCustomers,
      repeatCustomerRatePercent,
      avgCustomerLifetimeValue,
      top10CustomersBySpend,
      geographicBreakdown,
    };
  }

  async getPaymentsMetrics(start: Date, end: Date) {
    const [methodRows, successAgg, feesAgg, pendingCodAgg] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          method: string;
          count: bigint;
          total_amount: string | null;
        }>
      >`
        SELECT
          provider::text as method,
          COUNT(id) as count,
          COALESCE(SUM(amount), 0)::text as total_amount
        FROM "Payment"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY provider
        ORDER BY count DESC
      `,
      prisma.$queryRaw<
        Array<{
          total_payments: bigint;
          successful_payments: bigint;
        }>
      >`
        SELECT
          COUNT(id) as total_payments,
          COUNT(CASE WHEN status = 'PAID' THEN 1 END) as successful_payments
        FROM "Payment"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      `,
      prisma.$queryRaw<Array<{ total_fees: string | null }>>`
        SELECT COALESCE(SUM("paymentFee"), 0)::text as total_fees
        FROM "Payment"
        WHERE status = 'PAID' AND "paidAt" >= ${start} AND "paidAt" < ${end}
      `,
      prisma.$queryRaw<Array<{ pending_cod: string | null }>>`
        SELECT COALESCE(SUM("grandTotal"), 0)::text as pending_cod
        FROM "Order"
        WHERE "paymentMethod" = 'COD'
          AND status IN ('SHIPPED', 'DELIVERED')
          AND "paymentStatus" != 'PAID'
      `,
    ]);

    const totalPayments = Number(successAgg[0]?.total_payments || 0n);
    const successfulPayments = Number(successAgg[0]?.successful_payments || 0n);
    const successRatePercent =
      totalPayments > 0
        ? Math.round((successfulPayments / totalPayments) * 10000) / 100
        : 0;

    const totalGatewayFees = Number(
      new Decimal(feesAgg[0]?.total_fees || '0').toFixed(2),
    );
    const pendingCodCollections = Number(
      new Decimal(pendingCodAgg[0]?.pending_cod || '0').toFixed(2),
    );

    const methodBreakdown = methodRows.map(r => ({
      method: r.method,
      count: Number(r.count),
      totalAmount: Number(new Decimal(r.total_amount || '0').toFixed(2)),
    }));

    return {
      methodBreakdown,
      successRatePercent,
      totalGatewayFees,
      pendingCodCollections,
    };
  }

  async getFunnelMetrics(start: Date, end: Date) {
    const [sessionsAgg, ordersAgg, deliveredAgg] = await Promise.all([
      prisma.$queryRaw<Array<{ session_count: bigint }>>`
        SELECT COUNT(id) as session_count
        FROM "CheckoutSession"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      `,
      prisma.$queryRaw<Array<{ placed_count: bigint }>>`
        SELECT COUNT(id) as placed_count
        FROM "Order"
        WHERE status != 'CANCELLED' AND "placedAt" >= ${start} AND "placedAt" < ${end}
      `,
      prisma.$queryRaw<Array<{ delivered_count: bigint }>>`
        SELECT COUNT(id) as delivered_count
        FROM "Order"
        WHERE status = 'DELIVERED' AND "deliveredAt" >= ${start} AND "deliveredAt" < ${end}
      `,
    ]);

    return {
      sessionsInitiated: Number(sessionsAgg[0]?.session_count || 0n),
      ordersPlaced: Number(ordersAgg[0]?.placed_count || 0n),
      ordersDelivered: Number(deliveredAgg[0]?.delivered_count || 0n),
    };
  }

  async getChartData(
    type: ChartType,
    start: Date,
    end: Date,
    bucketType: 'hour' | 'day' | 'month',
  ): Promise<Array<{ bucket: string; [key: string]: unknown }>> {
    const truncUnit = bucketType === 'hour' ? 'hour' : bucketType === 'month' ? 'month' : 'day';

    switch (type) {
      case 'sales-trend': {
        const rows = await prisma.$queryRaw<
          Array<{
            bucket: string;
            gross_sales: string;
            net_sales: string;
          }>
        >`
          SELECT
            TO_CHAR(date_trunc(${truncUnit}, o."placedAt" AT TIME ZONE 'Asia/Dhaka'), 
              CASE WHEN ${truncUnit} = 'hour' THEN 'YYYY-MM-DD HH24:00'
                   WHEN ${truncUnit} = 'month' THEN 'YYYY-MM'
                   ELSE 'YYYY-MM-DD' END) as bucket,
            COALESCE(SUM(o.subtotal), 0)::text as gross_sales,
            COALESCE(SUM(o.subtotal - o."discountTotal"), 0)::text as net_sales
          FROM "Order" o
          WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
        return rows.map(r => ({
          bucket: r.bucket,
          grossSales: Number(new Decimal(r.gross_sales).toFixed(2)),
          netSales: Number(new Decimal(r.net_sales).toFixed(2)),
        }));
      }

      case 'orders-trend': {
        const rows = await prisma.$queryRaw<
          Array<{
            bucket: string;
            order_count: bigint;
          }>
        >`
          SELECT
            TO_CHAR(date_trunc(${truncUnit}, o."placedAt" AT TIME ZONE 'Asia/Dhaka'), 
              CASE WHEN ${truncUnit} = 'hour' THEN 'YYYY-MM-DD HH24:00'
                   WHEN ${truncUnit} = 'month' THEN 'YYYY-MM'
                   ELSE 'YYYY-MM-DD' END) as bucket,
            COUNT(o.id) as order_count
          FROM "Order" o
          WHERE o.status != 'CANCELLED'
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
        return rows.map(r => ({
          bucket: r.bucket,
          orderCount: Number(r.order_count),
        }));
      }

      case 'profit-trend': {
        const rows = await prisma.$queryRaw<
          Array<{
            bucket: string;
            gross_sales: string;
            cogs_sum: string;
            total_items: bigint;
            items_with_cost: bigint;
          }>
        >`
          SELECT
            TO_CHAR(date_trunc(${truncUnit}, o."placedAt" AT TIME ZONE 'Asia/Dhaka'), 
              CASE WHEN ${truncUnit} = 'hour' THEN 'YYYY-MM-DD HH24:00'
                   WHEN ${truncUnit} = 'month' THEN 'YYYY-MM'
                   ELSE 'YYYY-MM-DD' END) as bucket,
            COALESCE(SUM(o.subtotal - o."discountTotal"), 0)::text as gross_sales,
            COALESCE(SUM(items.cogs), 0)::text as cogs_sum,
            COALESCE(SUM(items.total_items), 0) as total_items,
            COALESCE(SUM(items.items_with_cost), 0) as items_with_cost
          FROM "Order" o
          LEFT JOIN (
            SELECT
              "orderId",
              SUM(CASE WHEN "costPrice" IS NOT NULL THEN "costPrice" * quantity ELSE 0 END) as cogs,
              COUNT(id) as total_items,
              COUNT(CASE WHEN "costPrice" IS NOT NULL AND "costPrice" > 0 THEN 1 END) as items_with_cost
            FROM "OrderItem"
            GROUP BY "orderId"
          ) items ON o.id = items."orderId"
          WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          GROUP BY 1
          ORDER BY 1 ASC
        `;
        return rows.map(r => {
          const totalItems = Number(r.total_items);
          const itemsWithCost = Number(r.items_with_cost);
          const isComplete = totalItems === 0 || itemsWithCost === totalItems;
          const netSales = new Decimal(r.gross_sales);
          const cogs = new Decimal(r.cogs_sum);
          const grossProfit = isComplete ? netSales.minus(cogs).toNumber() : null;

          return {
            bucket: r.bucket,
            grossProfit,
            isComplete,
          };
        });
      }

      case 'payment-method-pie': {
        const rows = await prisma.$queryRaw<
          Array<{
            method: string;
            count: bigint;
            total_amount: string;
          }>
        >`
          SELECT
            "paymentMethod"::text as method,
            COUNT(id) as count,
            COALESCE(SUM("grandTotal"), 0)::text as total_amount
          FROM "Order"
          WHERE status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          GROUP BY "paymentMethod"
        `;
        return rows.map(r => ({
          bucket: r.method,
          count: Number(r.count),
          totalAmount: Number(new Decimal(r.total_amount).toFixed(2)),
        }));
      }

      case 'order-status-pie': {
        const rows = await prisma.$queryRaw<
          Array<{
            status: string;
            count: bigint;
          }>
        >`
          SELECT
            status::text as status,
            COUNT(id) as count
          FROM "Order"
          WHERE "placedAt" >= ${start} AND "placedAt" < ${end}
          GROUP BY status
        `;
        return rows.map(r => ({
          bucket: r.status,
          count: Number(r.count),
        }));
      }

      case 'top-categories-bar': {
        const rows = await prisma.$queryRaw<
          Array<{
            category_name: string;
            revenue: string;
            quantity: bigint;
          }>
        >`
          SELECT
            COALESCE(c.name, 'Uncategorized') as category_name,
            SUM(oi."lineTotal")::text as revenue,
            SUM(oi.quantity) as quantity
          FROM "OrderItem" oi
          JOIN "Order" o ON oi."orderId" = o.id
          JOIN "ProductVariant" pv ON oi."variantId" = pv.id
          JOIN "Product" p ON pv."productId" = p.id
          LEFT JOIN "Category" c ON p."categoryId" = c.id
          WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          GROUP BY c.name
          ORDER BY SUM(oi."lineTotal") DESC
          LIMIT 10
        `;
        return rows.map(r => ({
          bucket: r.category_name,
          revenue: Number(new Decimal(r.revenue).toFixed(2)),
          quantity: Number(r.quantity),
        }));
      }

      case 'hourly-heatmap': {
        const rows = await prisma.$queryRaw<
          Array<{
            day_of_week: number;
            hour_of_day: number;
            order_count: bigint;
            revenue: string;
          }>
        >`
          SELECT
            EXTRACT(DOW FROM (o."placedAt" AT TIME ZONE 'Asia/Dhaka'))::int as day_of_week,
            EXTRACT(HOUR FROM (o."placedAt" AT TIME ZONE 'Asia/Dhaka'))::int as hour_of_day,
            COUNT(o.id) as order_count,
            COALESCE(SUM(o."grandTotal"), 0)::text as revenue
          FROM "Order" o
          WHERE o.status != 'CANCELLED'
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          GROUP BY 1, 2
          ORDER BY 1, 2
        `;
        return rows.map(r => ({
          bucket: `${r.day_of_week}-${r.hour_of_day}`,
          dayOfWeek: r.day_of_week,
          hourOfDay: r.hour_of_day,
          orderCount: Number(r.order_count),
          revenue: Number(new Decimal(r.revenue).toFixed(2)),
        }));
      }

      case 'district-choropleth-data': {
        const rows = await prisma.$queryRaw<
          Array<{
            district: string;
            order_count: bigint;
            revenue: string;
          }>
        >`
          SELECT
            COALESCE(o."shippingAddressSnapshot"->>'district', 'Unknown') as district,
            COUNT(o.id) as order_count,
            COALESCE(SUM(o."grandTotal"), 0)::text as revenue
          FROM "Order" o
          WHERE o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'REFUNDED')
            AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          GROUP BY 1
          ORDER BY 3 DESC
        `;
        return rows.map(r => ({
          bucket: r.district,
          orderCount: Number(r.order_count),
          revenue: Number(new Decimal(r.revenue).toFixed(2)),
        }));
      }

      default:
        return [];
    }
  }
}

export const analyticsRepository = new AnalyticsRepository();
