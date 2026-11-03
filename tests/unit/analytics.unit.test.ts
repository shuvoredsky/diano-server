import { describe, it, expect, vi } from 'vitest';
import { AnalyticsService } from '@/modules/analytics/analytics.service';
import type { IAnalyticsRepository, OverviewMetricsRaw } from '@/modules/analytics/analytics.repository';

describe('AnalyticsService Unit Tests', () => {
  const mockCurrentMetrics: OverviewMetricsRaw = {
    grossSales: 10000,
    discounts: 1000,
    refunds: 500,
    netSales: 8500,
    totalOrders: 20,
    cancelledOrders: 2,
    cancellationRate: 10,
    aov: 425,
    itemsSold: 40,
    returnedOrders: 1,
    returnRate: 5,
    customerCount: 15,
    repeatCustomerRate: 20,
    undeliveredOrdersCount: 4,
    cogs: 4000,
    cogsCoverage: 80, // Incomplete coverage!
    isCogsComplete: false,
    grossProfit: null,
    expenses: 1200,
    paymentFees: 150,
    netProfit: null,
  };

  it('strictly sets grossProfit and netProfit to null when COGS coverage is < 100%', async () => {
    const mockRepo: IAnalyticsRepository = {
      getOverviewMetrics: vi.fn().mockImplementation((_start: Date) => {
        // Return current or previous based on date
        return Promise.resolve(mockCurrentMetrics);
      }),
      getRevenueMetrics: vi.fn(),
      getOrdersMetrics: vi.fn(),
      getProductsMetrics: vi.fn(),
      getInventoryMetrics: vi.fn(),
      getCustomersMetrics: vi.fn(),
      getPaymentsMetrics: vi.fn(),
      getFunnelMetrics: vi.fn(),
      getChartData: vi.fn(),
    };

    const service = new AnalyticsService(mockRepo, 60);
    const overview = await service.getOverview({ period: 'today' });

    expect(overview.cards.grossProfit?.current).toBeNull();
    expect(overview.cards.netProfit?.current).toBeNull();
    expect(overview.cards.grossProfit?.note).toMatch(/COGS incomplete \(80% coverage\)/);
  });

  it('calculates grossProfit and netProfit when COGS coverage is 100%', async () => {
    const completeMetrics: OverviewMetricsRaw = {
      ...mockCurrentMetrics,
      cogsCoverage: 100,
      isCogsComplete: true,
      grossProfit: 4500,
      netProfit: 3150,
    };

    const mockRepo: IAnalyticsRepository = {
      getOverviewMetrics: vi.fn().mockResolvedValue(completeMetrics),
      getRevenueMetrics: vi.fn(),
      getOrdersMetrics: vi.fn(),
      getProductsMetrics: vi.fn(),
      getInventoryMetrics: vi.fn(),
      getCustomersMetrics: vi.fn(),
      getPaymentsMetrics: vi.fn(),
      getFunnelMetrics: vi.fn(),
      getChartData: vi.fn(),
    };

    const service = new AnalyticsService(mockRepo, 60);
    const overview = await service.getOverview({ period: 'this_month' });

    expect(overview.cards.grossProfit?.current).toBe(4500);
    expect(overview.cards.netProfit?.current).toBe(3150);
  });

  it('serves responses from in-memory cache on consecutive calls', async () => {
    const getOverviewSpy = vi.fn().mockResolvedValue(mockCurrentMetrics);

    const mockRepo: IAnalyticsRepository = {
      getOverviewMetrics: getOverviewSpy,
      getRevenueMetrics: vi.fn(),
      getOrdersMetrics: vi.fn(),
      getProductsMetrics: vi.fn(),
      getInventoryMetrics: vi.fn(),
      getCustomersMetrics: vi.fn(),
      getPaymentsMetrics: vi.fn(),
      getFunnelMetrics: vi.fn(),
      getChartData: vi.fn(),
    };

    const service = new AnalyticsService(mockRepo, 60);

    await service.getOverview({ period: 'last_7_days' });
    expect(getOverviewSpy).toHaveBeenCalledTimes(2); // 1 current + 1 previous

    // Second call with same period should hit cache
    await service.getOverview({ period: 'last_7_days' });
    expect(getOverviewSpy).toHaveBeenCalledTimes(2); // no extra repository calls!
  });

  it('computes funnel drop-off percentages step-by-step', async () => {
    const mockRepo: IAnalyticsRepository = {
      getOverviewMetrics: vi.fn(),
      getRevenueMetrics: vi.fn(),
      getOrdersMetrics: vi.fn(),
      getProductsMetrics: vi.fn(),
      getInventoryMetrics: vi.fn(),
      getCustomersMetrics: vi.fn(),
      getPaymentsMetrics: vi.fn(),
      getFunnelMetrics: vi.fn().mockResolvedValue({
        sessionsInitiated: 1000,
        ordersPlaced: 200,
        ordersDelivered: 180,
      }),
      getChartData: vi.fn(),
    };

    const service = new AnalyticsService(mockRepo, 60);
    const funnel = await service.getFunnel({ period: 'this_month' });

    expect(funnel.steps).toHaveLength(3);
    // Step 1: Checkout Initiated
    expect(funnel.steps[0]).toEqual({
      name: 'Checkout Initiated',
      count: 1000,
      dropOffPercent: 0,
      conversionFromPreviousPercent: 100,
    });
    // Step 2: Order Placed (200 / 1000 = 20%, dropoff 80%)
    expect(funnel.steps[1]).toEqual({
      name: 'Order Placed',
      count: 200,
      dropOffPercent: 80,
      conversionFromPreviousPercent: 20,
    });
    // Step 3: Order Delivered (180 / 200 = 90%, dropoff 10%)
    expect(funnel.steps[2]).toEqual({
      name: 'Order Delivered',
      count: 180,
      dropOffPercent: 10,
      conversionFromPreviousPercent: 90,
    });
    expect(funnel.overallConversionPercent).toBe(18); // 180 / 1000 = 18%
  });
});
