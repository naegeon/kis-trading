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
import { RefreshCw } from 'lucide-react';
import type { Order, OrderStatus } from '@/types/order';

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
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
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
