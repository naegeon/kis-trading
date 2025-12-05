import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { performanceMetrics } from '@/lib/db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { api } from '@/lib/api';
import { subDays } from 'date-fns';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'daily' or 'strategy-comparison'
  const days = parseInt(searchParams.get('days') || '30');

  try {
    if (type === 'daily') {
      const startDate = subDays(new Date(), days);
      const dailyMetrics = await db.query.performanceMetrics.findMany({
        where: and(
          eq(performanceMetrics.userId, userId),
          gte(performanceMetrics.date, startDate)
        ),
        orderBy: desc(performanceMetrics.date),
      });

      // Format for chart: [{ date: 'YYYY-MM-DD', returnRate: X.XX }]
      const chartData = dailyMetrics.map(metric => ({
        date: metric.date,
        returnRate: metric.returnRate,
      }));

      return api.success(chartData);
    } else if (type === 'strategy-comparison') {
      const strategyMetrics = await db.query.performanceMetrics.findMany({
        where: eq(performanceMetrics.userId, userId),
        orderBy: desc(performanceMetrics.date),
        with: {
          strategy: true,
        },
      });

      // Group by strategy and get the latest metric for each
      type MetricWithStrategy = typeof strategyMetrics[0];
      const latestStrategyMetricsMap = new Map<string, MetricWithStrategy>();
      for (const metric of strategyMetrics) {
        if (metric.strategyId && (!latestStrategyMetricsMap.has(metric.strategyId) || latestStrategyMetricsMap.get(metric.strategyId)!.date < metric.date)) {
          latestStrategyMetricsMap.set(metric.strategyId, metric);
        }
      }

      const chartData = Array.from(latestStrategyMetricsMap.values()).map(metric => ({
        strategyName: metric.strategy?.name || 'Unknown',
        returnRate: metric.returnRate,
      }));

      return api.success(chartData);
    } else {
      return api.error('Invalid chart type specified', 400);
    }
  } catch (error) {
    console.error('GET /api/performance/chart error:', error);
    return api.error('Failed to fetch chart data', 500);
  }
}
