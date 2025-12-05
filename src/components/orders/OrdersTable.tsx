'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OrderStatusBadge } from './OrderStatusBadge';
import { SymbolDisplay } from './SymbolDisplay';
import { QuantityProgress } from './QuantityProgress';
import { PriceDisplay } from './PriceDisplay';
import { ChevronRight, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STRATEGY_TYPE_LABELS } from '@/lib/constants/strategy';
import type { Order } from '@/types/order';

interface OrderWithDetails extends Order {
  symbolName?: string | null;
  strategyName?: string | null;
  strategyType?: string | null;
}

interface OrdersTableProps {
  orders: OrderWithDetails[];
  isLoading: boolean;
  onRowClick?: (order: Order) => void;
}

const orderTypeLabels: Record<string, string> = {
  MARKET: '시장가',
  LIMIT: '지정가',
  LOO: 'LOO',
  LOC: 'LOC',
};

function formatDate(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yy}/${mm}/${dd} ${hh}:${min}`;
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 10 }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <TableRow>
      <TableCell colSpan={10} className="h-32 text-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Info className="h-8 w-8" />
          <p>표시할 주문이 없습니다.</p>
          <p className="text-sm">전략을 생성하면 주문이 자동으로 표시됩니다.</p>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function OrdersTable({ orders, isLoading, onRowClick }: OrdersTableProps) {
  return (
    <TooltipProvider>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">주문 시각</TableHead>
              <TableHead className="w-[80px]">전략</TableHead>
              <TableHead className="w-[180px]">종목</TableHead>
              <TableHead className="w-[60px]">구분</TableHead>
              <TableHead className="w-[60px]">타입</TableHead>
              <TableHead className="text-center w-[80px]">체결</TableHead>
              <TableHead className="text-right w-[90px]">가격</TableHead>
              <TableHead className="w-[70px]">상태</TableHead>
              <TableHead className="w-[60px] text-center">메모</TableHead>
              <TableHead className="w-[32px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : orders.length === 0 ? (
              <EmptyState />
            ) : (
              orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  onClick={() => onRowClick?.(order)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

interface OrderRowProps {
  order: OrderWithDetails;
  onClick: () => void;
}

function OrderRow({ order, onClick }: OrderRowProps) {
  const orderPrice = order.price ? Number(order.price) : null;
  const avgPrice = order.avgPrice ? Number(order.avgPrice) : null;
  const hasError = order.status === 'FAILED' || order.status === 'CANCELLED';

  return (
    <TableRow
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-colors group",
        "hover:bg-muted/70 hover:shadow-sm"
      )}
    >
      {/* 주문 시각 */}
      <TableCell className="text-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{formatDate(order.submittedAt)}</span>
          </TooltipTrigger>
          <TooltipContent>
            {new Date(order.submittedAt).toLocaleString('ko-KR')}
          </TooltipContent>
        </Tooltip>
      </TableCell>

      {/* 전략 타입 (분할매매/앞뒤로) */}
      <TableCell>
        {order.strategyType ? (
          <span className="font-medium text-sm">
            {STRATEGY_TYPE_LABELS[order.strategyType] || order.strategyType}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">수동</span>
        )}
      </TableCell>

      {/* 종목 */}
      <TableCell>
        <SymbolDisplay symbol={order.symbol} name={order.symbolName} />
      </TableCell>

      {/* 구분 (매수/매도) */}
      <TableCell>
        <Badge
          variant={order.side === 'BUY' ? 'default' : 'destructive'}
          className="px-2 py-0.5"
        >
          {order.side === 'BUY' ? '매수' : '매도'}
        </Badge>
      </TableCell>

      {/* 주문 타입 */}
      <TableCell className="text-sm">
        {orderTypeLabels[order.orderType] || order.orderType}
      </TableCell>

      {/* 체결 수량 */}
      <TableCell>
        <QuantityProgress
          filled={order.filledQuantity || 0}
          total={order.quantity}
        />
      </TableCell>

      {/* 가격 정보 */}
      <TableCell>
        <PriceDisplay
          orderPrice={orderPrice}
          fillPrice={avgPrice}
          filledQty={order.filledQuantity || 0}
        />
      </TableCell>

      {/* 상태 */}
      <TableCell>
        <OrderStatusBadge status={order.status} />
      </TableCell>

      {/* 메시지 (아이콘+툴팁) */}
      <TableCell className="text-center">
        {order.errorMessage ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="inline-flex items-center justify-center">
                <AlertCircle className={cn(
                  "h-4 w-4",
                  hasError ? "text-destructive" : "text-muted-foreground"
                )} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[300px]">
              {order.errorMessage}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* 상세보기 화살표 */}
      <TableCell className="text-right">
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </TableCell>
    </TableRow>
  );
}
