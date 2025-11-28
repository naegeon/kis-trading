'use client';

import { useState } from 'react';
import { useOrders } from '@/hooks/useOrders';
import { OrderFilters as OrderFiltersComponent } from '@/components/orders/OrderFilters';
import { OrdersTable } from '@/components/orders/OrdersTable';
import { OrderDetail } from '@/components/orders/OrderDetail';
import { OrderSummaryCards } from '@/components/orders/OrderSummaryCards';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { ContentCard } from '@/components/layout/ContentCard';
import { OrderMobileList } from '@/components/orders/OrderMobileCard';
import { RefreshCw, Trash2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Order, OrderStatus } from '@/types/order';
import { useToast } from '@/hooks/use-toast';

export default function OrdersPage() {
  const {
    orders,
    strategies,
    pagination,
    summary,
    filters,
    isLoading,
    error,
    handleFilterChange,
    handlePageChange,
    handleLimitChange,
    refreshOrders,
  } = useOrders();

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const { toast } = useToast();

  const handleRowClick = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  const handleModalClose = () => {
    setIsDetailOpen(false);
    setSelectedOrder(null);
  };

  const handleOrderCancelled = () => {
    refreshOrders();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshOrders();
    setIsRefreshing(false);
  };

  const handleCleanupOrphans = async (forceAll: boolean = false) => {
    // 강제 모드일 때 확인 메시지
    if (forceAll) {
      const confirmed = window.confirm(
        '모든 미체결 주문을 취소하시겠습니까?\n\n' +
        '이 작업은 전략 상태와 관계없이 모든 SUBMITTED 상태의 주문을 취소합니다.'
      );
      if (!confirmed) return;
    }

    setIsCleaningUp(true);
    try {
      const url = forceAll ? '/api/orders/cleanup?force=true' : '/api/orders/cleanup';
      const response = await fetch(url, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: forceAll ? '전체 미체결 주문 정리 완료' : '고아 주문 정리 완료',
          description: `${data.cancelledCount}건 취소됨${data.failedCount > 0 ? `, ${data.failedCount}건 실패` : ''}`,
        });
        refreshOrders();
      } else {
        toast({
          title: '정리 실패',
          description: data.error || '알 수 없는 오류가 발생했습니다.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: '정리 실패',
        description: '서버와 통신 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  // 카드 클릭 시 상태 필터링
  const handleFilterByStatus = (statuses: OrderStatus[]) => {
    handleFilterChange({ ...filters, statuses });
  };

  return (
    <PageContainer>
      <PageHeader
        title="주문 내역"
        description="전략에 의해 실행된 주문 내역을 확인합니다."
        breadcrumbs={[
          { label: '홈', href: '/' },
          { label: '주문 내역' },
        ]}
        actions={
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isCleaningUp}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isCleaningUp ? '정리 중...' : '주문 정리'}
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleCleanupOrphans(false)}>
                  고아 주문 정리
                  <span className="text-xs text-muted-foreground ml-2">
                    (비활성 전략)
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleCleanupOrphans(true)}
                  className="text-destructive"
                >
                  전체 미체결 취소
                  <span className="text-xs text-muted-foreground ml-2">
                    (모든 대기 주문)
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        }
      />

      <OrderSummaryCards
        summary={summary}
        onFilterByStatus={handleFilterByStatus}
        activeStatuses={filters.statuses}
      />

      <ContentCard>
        <OrderFiltersComponent
          strategies={strategies}
          onFilterChange={handleFilterChange}
          currentFilters={filters}
        />

        {error && (
          <p className="text-destructive py-4">주문 조회 오류: {error}</p>
        )}

        {/* 데스크톱: 테이블 뷰 */}
        <div className="hidden md:block">
          <OrdersTable
            orders={orders}
            isLoading={isLoading}
            onRowClick={handleRowClick}
          />
        </div>

        {/* 모바일: 카드 뷰 */}
        <div className="block md:hidden">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              주문을 불러오는 중...
            </div>
          ) : (
            <OrderMobileList
              orders={orders}
              onRowClick={handleRowClick}
            />
          )}
        </div>

        {/* 페이지네이션 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              총 {pagination.total}건
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">표시:</span>
              <Select
                value={pagination.limit.toString()}
                onValueChange={(val) => handleLimitChange(Number(val))}
              >
                <SelectTrigger className="w-[80px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10개</SelectItem>
                  <SelectItem value="20">20개</SelectItem>
                  <SelectItem value="50">50개</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              이전
            </Button>
            <span className="text-sm text-muted-foreground">
              {pagination.page} / {pagination.totalPages} 페이지
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              다음
            </Button>
          </div>
        </div>
      </ContentCard>

      <OrderDetail
        order={selectedOrder}
        isOpen={isDetailOpen}
        onOpenChange={handleModalClose}
        onOrderCancelled={handleOrderCancelled}
      />
    </PageContainer>
  );
}
