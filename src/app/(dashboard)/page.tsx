'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { ContentCard } from '@/components/layout/ContentCard';
import { Strategy } from '@/types/strategy';
import {
  TrendingUp,
  DollarSign,
  Activity,
  ListOrdered,
  PlusCircle,
} from 'lucide-react';
import { StrategyCard } from '@/components/common/StrategyCard';
import { STRATEGY_TYPE_FULL_LABELS } from '@/lib/constants/strategy';

export default function DashboardPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStrategies() {
      try {
        setLoading(true);
        const response = await fetch('/api/strategies');
        if (!response.ok) {
          throw new Error('Failed to fetch strategies');
        }
        const data = await response.json();
        if (data.success) {
          setStrategies(data.data);
        } else {
          throw new Error(data.message || 'Failed to fetch strategies');
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unknown error occurred');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchStrategies();
  }, []);

  const activeStrategies = strategies.filter((s) => s.status === 'ACTIVE').length;

  return (
    <PageContainer>
      <PageHeader
        title="대시보드"
        description="자동매매 시스템의 전체 현황을 한눈에 확인하세요."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/strategies/split-order">
                <PlusCircle className="mr-2 h-4 w-4" />
                새 전략 만들기
              </Link>
            </Button>
          </div>
        }
      />

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="활성 전략"
          value={activeStrategies}
          description="현재 실행 중인 전략"
          icon={TrendingUp}
          trend={
            activeStrategies > 0
              ? { value: activeStrategies * 10, label: '이번 주' }
              : undefined
          }
        />
        <StatCard
          title="총 투자 금액"
          value="$0"
          description="전체 투자 금액"
          icon={DollarSign}
        />
        <StatCard
          title="총 수익률"
          value="0%"
          description="누적 수익률"
          icon={Activity}
          trend={{ value: 0, label: '지난 달 대비' }}
        />
        <StatCard
          title="오늘 주문"
          value="0건"
          description="금일 체결된 주문"
          icon={ListOrdered}
        />
      </div>

      {/* Active Strategies */}
      <ContentCard
        title="활성 전략"
        description="현재 실행 중인 자동매매 전략"
        headerAction={
          <Button variant="outline" size="sm" asChild>
            <Link href="/strategies">전체 보기</Link>
          </Button>
        }
      >
        {loading && (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">전략을 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-8">
            <p className="text-danger">오류: {error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {strategies.length > 0 ? (
              strategies.slice(0, 6).map((strategy) => (
                <StrategyCard key={strategy.id} strategy={strategy} variant="compact" />
              ))
            ) : (
              <div className="col-span-full flex flex-col items-center justify-center py-12">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">전략이 없습니다</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  첫 번째 자동매매 전략을 생성해보세요.
                </p>
                <div className="flex gap-2">
                  <Button asChild>
                    <Link href="/strategies/split-order">{STRATEGY_TYPE_FULL_LABELS.SPLIT_ORDER}</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/strategies/loo-loc">{STRATEGY_TYPE_FULL_LABELS.LOO_LOC}</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </ContentCard>
    </PageContainer>
  );
}
