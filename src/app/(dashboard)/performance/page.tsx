'use client';

import useSWR from 'swr';
import { AccountSummary } from '@/components/performance/AccountSummary';
import { StrategyPerformanceTable } from '@/components/performance/StrategyPerformanceTable';
import { DailyReturnChart } from '@/components/performance/DailyReturnChart';
import { StrategyComparisonChart } from '@/components/performance/StrategyComparisonChart';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { ContentCard } from '@/components/layout/ContentCard';
import { Skeleton } from '@/components/ui/skeleton';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PerformancePage() {
  const { data: dailyChartData, error: dailyChartError } = useSWR(
    '/api/performance/chart?type=daily',
    fetcher
  );
  const { data: strategyComparisonData, error: strategyComparisonError } =
    useSWR('/api/performance/chart?type=strategy-comparison', fetcher);

  return (
    <PageContainer>
      <PageHeader
        title="성과 분석"
        description="투자 성과와 전략별 수익률을 분석합니다."
        breadcrumbs={[
          { label: '홈', href: '/' },
          { label: '성과 분석' },
        ]}
      />

      <AccountSummary />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ContentCard title="일일 수익률">
          {dailyChartError ? (
            <div className="text-center py-12">
              <p className="text-destructive font-semibold mb-2">
                일일 수익률 차트를 불러올 수 없습니다
              </p>
              <p className="text-sm text-muted-foreground">
                활성화된 전략이 없거나 데이터가 충분하지 않습니다.
              </p>
            </div>
          ) : !dailyChartData ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <DailyReturnChart data={dailyChartData?.data || []} />
          )}
        </ContentCard>

        <ContentCard title="전략별 비교">
          {strategyComparisonError ? (
            <div className="text-center py-12">
              <p className="text-destructive font-semibold mb-2">
                전략 비교 차트를 불러올 수 없습니다
              </p>
              <p className="text-sm text-muted-foreground">
                활성화된 전략이 없거나 데이터가 충분하지 않습니다.
              </p>
            </div>
          ) : !strategyComparisonData ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <StrategyComparisonChart data={strategyComparisonData?.data || []} />
          )}
        </ContentCard>
      </div>

      <ContentCard title="전략별 성과">
        <StrategyPerformanceTable />
      </ContentCard>
    </PageContainer>
  );
}
