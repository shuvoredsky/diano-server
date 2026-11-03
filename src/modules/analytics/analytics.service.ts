import { env } from '@/config/env.config';
import { TtlCache } from '@/utils/ttl-cache';
import {
  resolvePeriod,
  calculateChange,
  generateDateBuckets,
  gapFillSeries,
  type AnalyticsPeriod,
} from './period.util';
import {
  analyticsRepository,
  type IAnalyticsRepository,
} from './analytics.repository';
import type {
  AnalyticsOverviewResponse,
  AnalyticsRevenueResponse,
  AnalyticsOrdersResponse,
  AnalyticsProductsResponse,
  AnalyticsInventoryResponse,
  AnalyticsCustomersResponse,
  AnalyticsPaymentsResponse,
  AnalyticsFunnelResponse,
  ChartType,
  KpiCard,
} from './analytics.types';

export class AnalyticsService {
  private cache: TtlCache<unknown>;

  constructor(
    private readonly repo: IAnalyticsRepository = analyticsRepository,
    cacheTtlSeconds: number = env.ANALYTICS_CACHE_TTL_SECONDS || 60,
  ) {
    this.cache = new TtlCache(cacheTtlSeconds);
  }

  private buildCacheKey(
    endpoint: string,
    period: AnalyticsPeriod,
    from?: string,
    to?: string,
    extra?: string,
  ): string {
    return `${endpoint}:${period}:${from || ''}:${to || ''}:${extra || ''}`;
  }

  private buildKpiCard(
    current: number | null,
    previous: number | null,
    unit: 'currency' | 'percent' | 'count',
    note?: string,
  ): KpiCard<number> {
    if (current === null) {
      return {
        current: null,
        previous: previous,
        change: null,
        percent: null,
        trend: 'NONE',
        unit,
        note,
      };
    }

    if (previous === null) {
      return {
        current,
        previous: null,
        change: null,
        percent: null,
        trend: 'NONE',
        unit,
        note,
      };
    }

    const { change, percent, trend } = calculateChange(current, previous);
    return {
      current,
      previous,
      change,
      percent,
      trend,
      unit,
      note,
    };
  }

  async getOverview(params: {
    period: AnalyticsPeriod;
    from?: string;
    to?: string;
    compare?: boolean;
  }): Promise<AnalyticsOverviewResponse> {
    const cacheKey = this.buildCacheKey('overview', params.period, params.from, params.to);
    const cached = this.cache.get(cacheKey) as AnalyticsOverviewResponse | undefined;
    if (cached) return cached;

    const resolution = resolvePeriod(params.period, params.from, params.to);
    const [currentRaw, previousRaw] = await Promise.all([
      this.repo.getOverviewMetrics(resolution.current.start, resolution.current.end),
      this.repo.getOverviewMetrics(resolution.previous.start, resolution.previous.end),
    ]);

    const grossProfitNote = !currentRaw.isCogsComplete
      ? `COGS incomplete (${currentRaw.cogsCoverage}% coverage). Profit cannot be determined accurately.`
      : undefined;

    const cards = {
      grossSales: this.buildKpiCard(currentRaw.grossSales, previousRaw.grossSales, 'currency'),
      netSales: this.buildKpiCard(currentRaw.netSales, previousRaw.netSales, 'currency'),
      totalOrders: this.buildKpiCard(currentRaw.totalOrders, previousRaw.totalOrders, 'count'),
      aov: this.buildKpiCard(currentRaw.aov, previousRaw.aov, 'currency'),
      itemsSold: this.buildKpiCard(currentRaw.itemsSold, previousRaw.itemsSold, 'count'),
      cancellationRate: this.buildKpiCard(
        currentRaw.cancellationRate,
        previousRaw.cancellationRate,
        'percent',
      ),
      returnRate: this.buildKpiCard(currentRaw.returnRate, previousRaw.returnRate, 'percent'),
      customerCount: this.buildKpiCard(
        currentRaw.customerCount,
        previousRaw.customerCount,
        'count',
      ),
      repeatCustomerRate: this.buildKpiCard(
        currentRaw.repeatCustomerRate,
        previousRaw.repeatCustomerRate,
        'percent',
      ),
      grossProfit: this.buildKpiCard(
        currentRaw.grossProfit,
        previousRaw.grossProfit,
        'currency',
        grossProfitNote,
      ),
      netProfit: this.buildKpiCard(
        currentRaw.netProfit,
        previousRaw.netProfit,
        'currency',
        grossProfitNote,
      ),
      undeliveredOrdersCount: this.buildKpiCard(
        currentRaw.undeliveredOrdersCount,
        previousRaw.undeliveredOrdersCount,
        'count',
      ),
    };

    const result: AnalyticsOverviewResponse = {
      period: resolution.period,
      range: {
        start: resolution.current.start.toISOString(),
        end: resolution.current.end.toISOString(),
      },
      comparisonRange: {
        start: resolution.previous.start.toISOString(),
        end: resolution.previous.end.toISOString(),
      },
      cards,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getRevenue(params: {
    period: AnalyticsPeriod;
    from?: string;
    to?: string;
  }): Promise<AnalyticsRevenueResponse> {
    const cacheKey = this.buildCacheKey('revenue', params.period, params.from, params.to);
    const cached = this.cache.get(cacheKey) as AnalyticsRevenueResponse | undefined;
    if (cached) return cached;

    const resolution = resolvePeriod(params.period, params.from, params.to);
    const rev = await this.repo.getRevenueMetrics(
      resolution.current.start,
      resolution.current.end,
    );

    const result: AnalyticsRevenueResponse = {
      period: resolution.period,
      grossSales: rev.grossSales,
      discounts: rev.discounts,
      refunds: rev.refunds,
      shippingRevenue: rev.shippingRevenue,
      taxRevenue: rev.taxRevenue,
      netSales: rev.netSales,
      cogs: rev.cogs,
      cogsCoveragePercent: rev.cogsCoverage,
      isCogsComplete: rev.isCogsComplete,
      grossProfit: rev.grossProfit,
      grossProfitMarginPercent: rev.grossProfitMargin,
      expenses: {
        total: rev.expensesTotal,
        byCategory: rev.expensesByCategory,
      },
      paymentFees: rev.paymentFees,
      netProfit: rev.netProfit,
      netProfitMarginPercent: rev.netProfitMargin,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getOrders(params: {
    period: AnalyticsPeriod;
    from?: string;
    to?: string;
  }): Promise<AnalyticsOrdersResponse> {
    const cacheKey = this.buildCacheKey('orders', params.period, params.from, params.to);
    const cached = this.cache.get(cacheKey) as AnalyticsOrdersResponse | undefined;
    if (cached) return cached;

    const resolution = resolvePeriod(params.period, params.from, params.to);
    const data = await this.repo.getOrdersMetrics(
      resolution.current.start,
      resolution.current.end,
    );

    const result: AnalyticsOrdersResponse = {
      period: resolution.period,
      ...data,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getProducts(params: {
    period: AnalyticsPeriod;
    from?: string;
    to?: string;
  }): Promise<AnalyticsProductsResponse> {
    const cacheKey = this.buildCacheKey('products', params.period, params.from, params.to);
    const cached = this.cache.get(cacheKey) as AnalyticsProductsResponse | undefined;
    if (cached) return cached;

    const resolution = resolvePeriod(params.period, params.from, params.to);
    const data = await this.repo.getProductsMetrics(
      resolution.current.start,
      resolution.current.end,
    );

    const result: AnalyticsProductsResponse = {
      period: resolution.period,
      ...data,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getInventory(): Promise<AnalyticsInventoryResponse> {
    const cacheKey = 'inventory:current';
    const cached = this.cache.get(cacheKey) as AnalyticsInventoryResponse | undefined;
    if (cached) return cached;

    const data = await this.repo.getInventoryMetrics();

    this.cache.set(cacheKey, data);
    return data;
  }

  async getCustomers(params: {
    period: AnalyticsPeriod;
    from?: string;
    to?: string;
  }): Promise<AnalyticsCustomersResponse> {
    const cacheKey = this.buildCacheKey('customers', params.period, params.from, params.to);
    const cached = this.cache.get(cacheKey) as AnalyticsCustomersResponse | undefined;
    if (cached) return cached;

    const resolution = resolvePeriod(params.period, params.from, params.to);
    const data = await this.repo.getCustomersMetrics(
      resolution.current.start,
      resolution.current.end,
    );

    const result: AnalyticsCustomersResponse = {
      period: resolution.period,
      ...data,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getPayments(params: {
    period: AnalyticsPeriod;
    from?: string;
    to?: string;
  }): Promise<AnalyticsPaymentsResponse> {
    const cacheKey = this.buildCacheKey('payments', params.period, params.from, params.to);
    const cached = this.cache.get(cacheKey) as AnalyticsPaymentsResponse | undefined;
    if (cached) return cached;

    const resolution = resolvePeriod(params.period, params.from, params.to);
    const data = await this.repo.getPaymentsMetrics(
      resolution.current.start,
      resolution.current.end,
    );

    const result: AnalyticsPaymentsResponse = {
      period: resolution.period,
      ...data,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getFunnel(params: {
    period: AnalyticsPeriod;
    from?: string;
    to?: string;
  }): Promise<AnalyticsFunnelResponse> {
    const cacheKey = this.buildCacheKey('funnel', params.period, params.from, params.to);
    const cached = this.cache.get(cacheKey) as AnalyticsFunnelResponse | undefined;
    if (cached) return cached;

    const resolution = resolvePeriod(params.period, params.from, params.to);
    const raw = await this.repo.getFunnelMetrics(
      resolution.current.start,
      resolution.current.end,
    );

    const sessionCount = raw.sessionsInitiated;
    const orderCount = raw.ordersPlaced;
    const deliveredCount = raw.ordersDelivered;

    const step1DropOff = sessionCount > 0 ? Math.round(((sessionCount - orderCount) / sessionCount) * 10000) / 100 : 0;
    const step1Conv = sessionCount > 0 ? Math.round((orderCount / sessionCount) * 10000) / 100 : 0;

    const step2DropOff = orderCount > 0 ? Math.round(((orderCount - deliveredCount) / orderCount) * 10000) / 100 : 0;
    const step2Conv = orderCount > 0 ? Math.round((deliveredCount / orderCount) * 10000) / 100 : 0;

    const overallConversion = sessionCount > 0 ? Math.round((deliveredCount / sessionCount) * 10000) / 100 : 0;

    const result: AnalyticsFunnelResponse = {
      period: resolution.period,
      steps: [
        {
          name: 'Checkout Initiated',
          count: sessionCount,
          dropOffPercent: 0,
          conversionFromPreviousPercent: 100,
        },
        {
          name: 'Order Placed',
          count: orderCount,
          dropOffPercent: Math.max(0, step1DropOff),
          conversionFromPreviousPercent: step1Conv,
        },
        {
          name: 'Order Delivered',
          count: deliveredCount,
          dropOffPercent: Math.max(0, step2DropOff),
          conversionFromPreviousPercent: step2Conv,
        },
      ],
      overallConversionPercent: overallConversion,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getChart(
    type: ChartType,
    params: {
      period: AnalyticsPeriod;
      from?: string;
      to?: string;
    },
  ): Promise<unknown[]> {
    const cacheKey = this.buildCacheKey(`chart:${type}`, params.period, params.from, params.to);
    const cached = this.cache.get(cacheKey) as unknown[] | undefined;
    if (cached) return cached;

    const resolution = resolvePeriod(params.period, params.from, params.to);
    const rawData = await this.repo.getChartData(
      type,
      resolution.current.start,
      resolution.current.end,
      resolution.bucketType,
    );

    // Apply gap filling for time-series charts
    if (type === 'sales-trend' || type === 'orders-trend' || type === 'profit-trend') {
      const buckets = generateDateBuckets(
        resolution.current.start,
        resolution.current.end,
        resolution.bucketType,
      );

      const map = new Map<string, { bucket: string; [key: string]: unknown }>();
      for (const item of rawData) {
        map.set(item.bucket, item);
      }

      const filled = gapFillSeries(buckets, map, bucket => {
        if (type === 'sales-trend') {
          return { bucket, grossSales: 0, netSales: 0 };
        }
        if (type === 'orders-trend') {
          return { bucket, orderCount: 0 };
        }
        return { bucket, grossProfit: 0, isComplete: true };
      });

      this.cache.set(cacheKey, filled);
      return filled;
    }

    this.cache.set(cacheKey, rawData);
    return rawData;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const analyticsService = new AnalyticsService();
