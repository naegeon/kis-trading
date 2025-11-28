
'use client';

import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PortfolioMetrics } from '@/types/performance';
import { formatCurrency, formatPercentage } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function AccountSummary() {
  const { data: response, error, isLoading } = useSWR<{ success: boolean, data: PortfolioMetrics, error?: string }>('/api/performance/summary', fetcher);

  const renderContent = () => {
    if (isLoading) {
      return <SummarySkeleton />;
    }

    if (error || !response?.success) {
      return <p className="text-red-500">요약 정보 로딩 실패: {response?.error || '클라이언트 측 오류'}</p>;
    }

    const { data } = response;
    const totalPnl = data.realizedPnl + data.unrealizedPnl;

    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="총 자산" value={formatCurrency(data.totalValue)} />
        <MetricCard title="총 투자 원금" value={formatCurrency(data.totalInvested)} />
        <MetricCard 
          title="총 손익" 
          value={formatCurrency(totalPnl)} 
          isPositive={totalPnl >= 0}
        />
        <MetricCard 
          title="수익률" 
          value={formatPercentage(data.returnRate)} 
          isPositive={data.returnRate >= 0}
        />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>계좌 요약</CardTitle>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
}

function MetricCard({ title, value, isPositive }: { title: string; value: string; isPositive?: boolean }) {
  const valueColor = isPositive === undefined ? '' : isPositive ? 'text-green-500' : 'text-red-500';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-1/2" />
      </CardContent>
    </Card>
  );
}
