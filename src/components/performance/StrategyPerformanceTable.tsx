
'use client';

import useSWR from 'swr';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SymbolDisplay } from '@/components/orders/SymbolDisplay';
import { StrategyMetrics } from '@/types/performance';
import { formatCurrency, formatPercentage } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function StrategyPerformanceTable() {
  const { data: response, error, isLoading } = useSWR<{ success: boolean, data: StrategyMetrics[], error?: string }>('/api/performance/strategies', fetcher);

  const renderContent = () => {
    if (isLoading) {
      return <TableSkeleton />;
    }

    if (error || !response?.success) {
      return <p className="text-red-500">전략별 성과 로딩 실패: {response?.error || '클라이언트 측 오류'}</p>;
    }

    const { data } = response;

    if (data.length === 0) {
      return <p>아직 표시할 전략 성과 데이터가 없습니다.</p>;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>전략</TableHead>
            <TableHead>종목</TableHead>
            <TableHead className="text-right">총 투자 원금</TableHead>
            <TableHead className="text-right">현재 가치</TableHead>
            <TableHead className="text-right">실현 손익</TableHead>
            <TableHead className="text-right">미실현 손익</TableHead>
            <TableHead className="text-right">수익률</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((metric) => {
            const totalPnl = metric.realizedPnl + metric.unrealizedPnl;
            const pnlColor = totalPnl >= 0 ? 'text-green-500' : 'text-red-500';

            return (
              <TableRow key={metric.strategyId}>
                <TableCell className="font-medium">{metric.strategyName}</TableCell>
                <TableCell>
                  {metric.symbol ? (
                    <SymbolDisplay symbol={metric.symbol} name={metric.symbolName} />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(metric.totalInvested)}</TableCell>
                <TableCell className="text-right">{formatCurrency(metric.totalValue)}</TableCell>
                <TableCell className="text-right">{formatCurrency(metric.realizedPnl)}</TableCell>
                <TableCell className="text-right">{formatCurrency(metric.unrealizedPnl)}</TableCell>
                <TableCell className={`text-right font-bold ${pnlColor}`}>{formatPercentage(metric.returnRate)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>전략별 성과</CardTitle>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-1/4" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
