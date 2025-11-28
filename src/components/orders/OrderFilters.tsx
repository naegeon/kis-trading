'use client';

import * as React from "react";
import { CalendarIcon, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { orderStatusEnum } from "@/lib/db/schema";
import { ORDER_STATUS_LABELS } from "@/lib/constants/strategy";
import type { Strategy } from "@/types/strategy";
import type { OrderStatus } from "@/types/order";
import type { OrderFilters } from "@/types/filter";

interface OrderFiltersProps {
  strategies: Strategy[];
  onFilterChange: (filters: OrderFilters) => void;
  currentFilters?: OrderFilters;
}

// 날짜 포맷 함수 (YY/MM/DD 형식)
function formatDateShort(date: Date): string {
  const yy = date.getFullYear().toString().slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}/${mm}/${dd}`;
}

export function OrderFilters({ strategies, onFilterChange, currentFilters }: OrderFiltersProps) {
  const [strategyId, setStrategyId] = React.useState(currentFilters?.strategyId);
  const [statuses, setStatuses] = React.useState<OrderStatus[]>(currentFilters?.statuses || []);
  const [startDate, setStartDate] = React.useState(currentFilters?.startDate);
  const [endDate, setEndDate] = React.useState(currentFilters?.endDate);
  const [isInitialRender, setIsInitialRender] = React.useState(true);

  // 외부에서 필터가 변경되면 내부 상태 동기화 (카드 클릭 등)
  React.useEffect(() => {
    if (currentFilters) {
      setStatuses(currentFilters.statuses || []);
      setStrategyId(currentFilters.strategyId);
      setStartDate(currentFilters.startDate);
      setEndDate(currentFilters.endDate);
    }
  }, [currentFilters]);

  // 내부 상태 변경 시 부모에게 알림 (초기 렌더링 제외)
  React.useEffect(() => {
    if (isInitialRender) {
      setIsInitialRender(false);
      return;
    }
    onFilterChange({ strategyId, statuses, startDate, endDate });
  }, [strategyId, statuses, startDate, endDate, onFilterChange, isInitialRender]);

  const handleStatusChange = (status: OrderStatus) => {
    setStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const clearFilters = () => {
    setStrategyId(undefined);
    setStatuses([]);
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const hasActiveFilters = strategyId || statuses.length > 0 || startDate || endDate;

  // 선택된 상태 레이블 표시
  const getStatusButtonLabel = (): string => {
    if (statuses.length === 0) return '상태 선택';
    if (statuses.length === 1) return ORDER_STATUS_LABELS[statuses[0]] || statuses[0];
    return `${statuses.length}개 상태 선택됨`;
  };

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-card border rounded-lg">
      {/* Strategy Filter */}
      <div className="flex-1 min-w-[160px]">
        <Select value={strategyId || 'all'} onValueChange={val => setStrategyId(val === 'all' ? undefined : val)}>
          <SelectTrigger>
            <SelectValue placeholder="전략 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 전략</SelectItem>
            {strategies.map(strategy => (
              <SelectItem key={strategy.id} value={strategy.id}>{strategy.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status Filter */}
      <div className="flex-1 min-w-[160px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              {getStatusButtonLabel()}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            {orderStatusEnum.enumValues.map(status => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={statuses.includes(status)}
                onCheckedChange={() => handleStatusChange(status)}
              >
                {ORDER_STATUS_LABELS[status] || status}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Start Date Filter */}
      <div className="flex-1 min-w-[140px]">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? formatDateShort(startDate) : <span>시작일</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
          </PopoverContent>
        </Popover>
      </div>

      {/* End Date Filter */}
      <div className="flex-1 min-w-[140px]">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? formatDateShort(endDate) : <span>종료일</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
          </PopoverContent>
        </Popover>
      </div>

      {/* Clear Button */}
      <Button
        variant="outline"
        onClick={clearFilters}
        disabled={!hasActiveFilters}
        className={cn(!hasActiveFilters && "opacity-50")}
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        필터 초기화
      </Button>
    </div>
  );
}
