'use client';

import { CheckCircle2, Clock, XCircle, AlertCircle, Loader2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OrderStatCard, OrderStatCardVariant } from '@/components/common/OrderStatCard';
import type { OrderStatus } from '@/types/order';

interface OrderSummary {
  total: number;
  submitted: number;
  filled: number;
  partiallyFilled: number;
  cancelled: number;
  failed: number;
}

interface OrderSummaryCardsProps {
  summary: OrderSummary;
  className?: string;
  onFilterByStatus?: (statuses: OrderStatus[]) => void;
  activeStatuses?: OrderStatus[];
}

export function OrderSummaryCards({
  summary,
  className,
  onFilterByStatus,
  activeStatuses = []
}: OrderSummaryCardsProps) {
  // 취소가 많으면 경고 색상 적용 (전체의 50% 이상)
  const cancelledVariant: OrderStatCardVariant =
    summary.total > 0 && (summary.cancelled / summary.total) >= 0.5
      ? 'warning'
      : 'muted';

  const handleClick = (statuses: OrderStatus[]): void => {
    if (onFilterByStatus) {
      // 이미 선택된 상태면 해제, 아니면 설정
      const isCurrentlyActive = statuses.every(s => activeStatuses.includes(s));
      onFilterByStatus(isCurrentlyActive ? [] : statuses);
    }
  };

  const isActive = (statuses: OrderStatus[]): boolean => {
    return statuses.length > 0 &&
           statuses.every(s => activeStatuses.includes(s)) &&
           activeStatuses.length === statuses.length;
  };

  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6', className)}>
      <OrderStatCard
        icon={FileText}
        label="전체"
        value={summary.total}
        variant="default"
        onClick={() => handleClick([])}
        isActive={activeStatuses.length === 0}
      />
      <OrderStatCard
        icon={Clock}
        label="대기"
        value={summary.submitted}
        variant="primary"
        onClick={() => handleClick(['SUBMITTED'])}
        isActive={isActive(['SUBMITTED'])}
      />
      <OrderStatCard
        icon={CheckCircle2}
        label="체결"
        value={summary.filled}
        variant="success"
        onClick={() => handleClick(['FILLED'])}
        isActive={isActive(['FILLED'])}
      />
      <OrderStatCard
        icon={Loader2}
        label="부분체결"
        value={summary.partiallyFilled}
        variant="warning"
        onClick={() => handleClick(['PARTIALLY_FILLED'])}
        isActive={isActive(['PARTIALLY_FILLED'])}
      />
      <OrderStatCard
        icon={XCircle}
        label="취소"
        value={summary.cancelled}
        variant={cancelledVariant}
        onClick={() => handleClick(['CANCELLED'])}
        isActive={isActive(['CANCELLED'])}
      />
      <OrderStatCard
        icon={AlertCircle}
        label="실패"
        value={summary.failed}
        variant="destructive"
        onClick={() => handleClick(['FAILED'])}
        isActive={isActive(['FAILED'])}
      />
    </div>
  );
}
