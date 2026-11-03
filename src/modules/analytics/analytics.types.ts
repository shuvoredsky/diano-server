import type { AnalyticsPeriod } from './period.util';

export interface KpiCard<T = number> {
  current: T | null;
  previous: T | null;
  change: number | null;
  percent: number | null;
  trend: 'UP' | 'DOWN' | 'FLAT' | 'NONE';
  unit?: 'currency' | 'percent' | 'count';
  note?: string;
}

export interface AnalyticsOverviewResponse {
  period: AnalyticsPeriod;
  range: {
    start: string;
    end: string;
  };
  comparisonRange: {
    start: string;
    end: string;
  };
  cards: {
    grossSales: KpiCard<number>;
    netSales: KpiCard<number>;
    totalOrders: KpiCard<number>;
    aov: KpiCard<number>;
    itemsSold: KpiCard<number>;
    cancellationRate: KpiCard<number>;
    returnRate: KpiCard<number>;
    customerCount: KpiCard<number>;
    repeatCustomerRate: KpiCard<number>;
    grossProfit: KpiCard<number> | null;
    netProfit: KpiCard<number> | null;
    undeliveredOrdersCount: KpiCard<number>;
  };
}

export interface ExpenseByCategory {
  category: string;
  amount: number;
}

export interface AnalyticsRevenueResponse {
  period: AnalyticsPeriod;
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
  // Financial fields - stripped if analytics:view_finance missing
  cogs?: number | null;
  cogsCoveragePercent?: number | null;
  isCogsComplete?: boolean;
  grossProfit?: number | null;
  grossProfitMarginPercent?: number | null;
  expenses?: {
    total: number;
    byCategory: ExpenseByCategory[];
  } | null;
  paymentFees?: number | null;
  netProfit?: number | null;
  netProfitMarginPercent?: number | null;
}

export interface AnalyticsOrdersResponse {
  period: AnalyticsPeriod;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  cancellationRatePercent: number;
  returnedOrders: number;
  returnRatePercent: number;
  avgFulfillmentTimeHours: number | null;
  statusBreakdown: Array<{
    status: string;
    count: number;
    percent: number;
  }>;
  paymentMethodBreakdown: Array<{
    method: string;
    count: number;
    totalAmount: number;
  }>;
}

export interface ProductPerformanceItem {
  productId: string;
  variantId?: string;
  productName: string;
  sku: string;
  quantitySold: number;
  revenue: number;
}

export interface ReturnedProductItem {
  productId: string;
  productName: string;
  sku: string;
  returnCount: number;
  returnRatePercent: number;
}

export interface DeadStockItem {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  stock: number;
  lastSoldAt: string | null;
}

export interface AnalyticsProductsResponse {
  period: AnalyticsPeriod;
  top10SellingByQty: ProductPerformanceItem[];
  top10SellingByRevenue: ProductPerformanceItem[];
  worst5Selling: ProductPerformanceItem[];
  topReturnedProducts: ReturnedProductItem[];
  deadStock: DeadStockItem[];
}

export interface AnalyticsInventoryResponse {
  totalStockUnits: number;
  outOfStockCount: number;
  lowStockCount: number;
  turnoverRateEstimate: number | null;
  // Stripped if not analytics:view_finance
  totalInventoryValuation?: number | null;
}

export interface CustomerSpendItem {
  customerId: string;
  fullName: string;
  email: string;
  orderCount: number;
  totalSpend: number;
}

export interface DistrictBreakdownItem {
  district: string;
  orderCount: number;
  totalRevenue: number;
}

export interface AnalyticsCustomersResponse {
  period: AnalyticsPeriod;
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  repeatCustomerRatePercent: number;
  avgCustomerLifetimeValue: number;
  top10CustomersBySpend: CustomerSpendItem[];
  geographicBreakdown: DistrictBreakdownItem[];
}

export interface AnalyticsPaymentsResponse {
  period: AnalyticsPeriod;
  methodBreakdown: Array<{
    method: string;
    count: number;
    totalAmount: number;
  }>;
  successRatePercent: number;
  pendingCodCollections: number;
  // Stripped if not analytics:view_finance
  totalGatewayFees?: number | null;
}

export interface FunnelStep {
  name: string;
  count: number;
  dropOffPercent: number;
  conversionFromPreviousPercent: number;
}

export interface AnalyticsFunnelResponse {
  period: AnalyticsPeriod;
  steps: FunnelStep[];
  overallConversionPercent: number;
}

export type ChartType =
  | 'sales-trend'
  | 'orders-trend'
  | 'profit-trend'
  | 'payment-method-pie'
  | 'order-status-pie'
  | 'top-categories-bar'
  | 'hourly-heatmap'
  | 'district-choropleth-data';

export interface ChartDataPoint {
  label: string;
  [key: string]: unknown;
}
