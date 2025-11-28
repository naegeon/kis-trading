'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OrderStatusBadge } from './OrderStatusBadge';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/order';

interface OrderWithDetails extends Order {
  symbolName?: string | null;
  strategyName?: string | null;
}

interface OrderMobileCardProps {
  order: OrderWithDetails;
  onClick: () => void;
}

function formatDate(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(price: number | null, currency = '$'): string {
  if (price === null) return '-';
  return `${currency}${price.toFixed(2)}`;
}

export function OrderMobileCard({ order, onClick }: OrderMobileCardProps) {
  const orderPrice = order.price ? Number(order.price) : null;
  const hasError = order.status === 'FAILED' || order.status === 'CANCELLED';

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          {/* 왼쪽: 종목 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">{order.symbol}</span>
              <Badge
                variant={order.side === 'BUY' ? 'default' : 'destructive'}
                className="px-1.5 py-0 text-xs"
              >
                {order.side === 'BUY' ? '매수' : '매도'}
              </Badge>
            </div>
            {order.symbolName && (
              <p className="text-xs text-muted-foreground truncate">
                {order.symbolName}
              </p>
            )}
          </div>

          {/* 오른쪽: 상태 */}
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {order.errorMessage && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className={cn(
                      "h-4 w-4",
                      hasError ? "text-destructive" : "text-muted-foreground"
                    )} />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[250px]">
                    {order.errorMessage}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* 하단: 상세 정보 */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t text-sm">
          <div className="flex items-center gap-4 text-muted-foreground">
            <span>{formatDate(order.submittedAt)}</span>
            {order.strategyName && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                {order.strategyName}
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="font-medium">{formatPrice(orderPrice)}</span>
            <span className="text-muted-foreground ml-1">× {order.quantity}주</span>
          </div>
        </div>

        {/* 체결 정보 (체결된 경우) */}
        {order.filledQuantity && order.filledQuantity > 0 && (
          <div className="mt-2 text-xs text-primary">
            체결: {order.filledQuantity}/{order.quantity}주
            {order.avgPrice && ` @ ${formatPrice(Number(order.avgPrice))}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface OrderMobileListProps {
  orders: OrderWithDetails[];
  onRowClick: (order: Order) => void;
}

export function OrderMobileList({ orders, onRowClick }: OrderMobileListProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>표시할 주문이 없습니다.</p>
        <p className="text-sm mt-1">전략을 생성하면 주문이 자동으로 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <OrderMobileCard
          key={order.id}
          order={order}
          onClick={() => onRowClick(order)}
        />
      ))}
    </div>
  );
}
