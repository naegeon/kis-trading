'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { StrategyCard } from '@/components/common/StrategyCard';
import { StrategyWithDetails } from '@/types/strategy';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Layers, TrendingUp, Filter, LayoutGrid } from 'lucide-react';
import { STRATEGY_TYPE_FULL_LABELS, STRATEGY_TYPE_LABELS } from '@/lib/constants/strategy';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type FilterType = 'all' | 'SPLIT_ORDER' | 'LOO_LOC';
type StatusFilter = 'all' | 'ACTIVE' | 'INACTIVE' | 'ENDED';
type GroupBy = 'none' | 'type' | 'status';

export function StrategiesList() {
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('type');

  const { data, error, isLoading, mutate } = useSWR<{
    success: boolean;
    data: StrategyWithDetails[];
  }>('/api/strategies', fetcher);

  // strategies를 useMemo로 안정화
  const strategies = useMemo(() => data?.data || [], [data]);

  // 필터링된 전략
  const filteredStrategies = useMemo(() => {
    return strategies.filter((s) => {
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
  }, [strategies, typeFilter, statusFilter]);

  // 그룹핑된 전략
  const groupedStrategies = useMemo(() => {
    if (groupBy === 'none') {
      return { '': filteredStrategies };
    }

    if (groupBy === 'type') {
      const groups: Record<string, StrategyWithDetails[]> = {
        'SPLIT_ORDER': [],
        'LOO_LOC': [],
      };
      filteredStrategies.forEach((s) => {
        if (groups[s.type]) {
          groups[s.type].push(s);
        }
      });
      return groups;
    }

    if (groupBy === 'status') {
      const groups: Record<string, StrategyWithDetails[]> = {
        'ACTIVE': [],
        'INACTIVE': [],
        'ENDED': [],
      };
      filteredStrategies.forEach((s) => {
        if (s.status && groups[s.status]) {
          groups[s.status].push(s);
        }
      });
      return groups;
    }

    return { '': filteredStrategies };
  }, [filteredStrategies, groupBy]);

  const typeLabels = STRATEGY_TYPE_FULL_LABELS;

  const statusLabels: Record<string, string> = {
    ACTIVE: '활성 전략',
    INACTIVE: '비활성 전략',
    ENDED: '종료된 전략',
  };

  const groupLabels = groupBy === 'type' ? typeLabels : groupBy === 'status' ? statusLabels : {};

  // 통계
  const stats = useMemo(() => {
    return {
      total: strategies.length,
      active: strategies.filter((s) => s.status === 'ACTIVE').length,
      splitOrder: strategies.filter((s) => s.type === 'SPLIT_ORDER').length,
      looLoc: strategies.filter((s) => s.type === 'LOO_LOC').length,
    };
  }, [strategies]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">전략을 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-destructive mb-2">전략을 불러올 수 없습니다</h2>
        <p className="text-muted-foreground">
          {error?.message || 'KIS API 인증 정보를 먼저 설정해주세요.'}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          설정 페이지에서 계좌 정보를 등록한 후 다시 시도해주세요.
        </p>
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">생성된 전략이 없습니다.</h2>
        <p className="text-muted-foreground mt-2">
          새로운 투자 전략을 추가하고 관리해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 필터 및 통계 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* 통계 배지 */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="px-3 py-1">
            전체 {stats.total}개
          </Badge>
          <Badge variant="default" className="px-3 py-1 bg-green-600">
            활성 {stats.active}개
          </Badge>
          <Badge variant="secondary" className="px-3 py-1">
            <Layers className="h-3 w-3 mr-1" />
            {STRATEGY_TYPE_LABELS.SPLIT_ORDER} {stats.splitOrder}개
          </Badge>
          <Badge variant="secondary" className="px-3 py-1">
            <TrendingUp className="h-3 w-3 mr-1" />
            {STRATEGY_TYPE_LABELS.LOO_LOC} {stats.looLoc}개
          </Badge>
        </div>

        {/* 필터 컨트롤 */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as FilterType)}>
              <SelectTrigger className="w-[130px] h-8">
                <SelectValue placeholder="전략 유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 유형</SelectItem>
                <SelectItem value="SPLIT_ORDER">{STRATEGY_TYPE_LABELS.SPLIT_ORDER}</SelectItem>
                <SelectItem value="LOO_LOC">{STRATEGY_TYPE_LABELS.LOO_LOC}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[110px] h-8">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 상태</SelectItem>
              <SelectItem value="ACTIVE">활성</SelectItem>
              <SelectItem value="INACTIVE">비활성</SelectItem>
              <SelectItem value="ENDED">종료</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 ml-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue placeholder="그룹" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">그룹 없음</SelectItem>
                <SelectItem value="type">유형별</SelectItem>
                <SelectItem value="status">상태별</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 필터 결과 없음 */}
      {filteredStrategies.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">조건에 맞는 전략이 없습니다.</p>
          <Button
            variant="link"
            onClick={() => {
              setTypeFilter('all');
              setStatusFilter('all');
            }}
          >
            필터 초기화
          </Button>
        </div>
      )}

      {/* 그룹별 전략 카드 */}
      {Object.entries(groupedStrategies).map(([groupKey, groupStrategies]) => {
        if (groupStrategies.length === 0 && groupBy !== 'none') return null;

        return (
          <div key={groupKey} className="space-y-4">
            {/* 그룹 헤더 */}
            {groupBy !== 'none' && groupKey && (
              <div className="flex items-center gap-2 pb-2 border-b">
                {groupBy === 'type' && (
                  groupKey === 'SPLIT_ORDER' ? (
                    <Layers className="h-4 w-4 text-blue-500" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  )
                )}
                <h3 className="font-semibold text-lg">
                  {groupLabels[groupKey] || groupKey}
                </h3>
                <Badge variant="outline" className="ml-2">
                  {groupStrategies.length}개
                </Badge>
              </div>
            )}

            {/* 전략 카드 그리드 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groupStrategies.map((strategy) => (
                <StrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  variant="default"
                  showActions={true}
                  onMutate={mutate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
