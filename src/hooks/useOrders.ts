'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Order } from '@/types/order';
import type { Strategy } from '@/types/strategy';
import type { OrderFilters } from '@/types/filter';

// 확장된 Order 타입
interface OrderWithDetails extends Order {
  symbolName?: string | null;
  strategyName?: string | null;
}

// 요약 통계 타입
interface OrderSummary {
  total: number;
  submitted: number;
  filled: number;
  partiallyFilled: number;
  cancelled: number;
  failed: number;
}

interface OrdersResponse {
  orders: OrderWithDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: OrderSummary;
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<OrderSummary>({
    total: 0,
    submitted: 0,
    filled: 0,
    partiallyFilled: 0,
    cancelled: 0,
    failed: 0,
  });
  const [filters, setFilters] = useState<OrderFilters>({ statuses: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page.toString());
      params.append('limit', pagination.limit.toString());

      if (filters.strategyId) {
        params.append('strategyId', filters.strategyId);
      }
      if (filters.statuses.length > 0) {
        params.append('status', filters.statuses.join(','));
      }
      if (filters.startDate) {
        params.append('startDate', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        params.append('endDate', filters.endDate.toISOString());
      }

      const response = await fetch(`/api/orders?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const body: { success: boolean; data?: OrdersResponse; error?: string } = await response.json();

      if (body.success && body.data) {
        setOrders(body.data.orders || []);
        if (body.data.pagination) {
          setPagination(body.data.pagination);
        }
        if (body.data.summary) {
          setSummary(body.data.summary);
        }
      } else {
        throw new Error(body.error || 'Failed to parse orders response');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  const fetchStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/strategies');
      if (!response.ok) {
        throw new Error('Failed to fetch strategies');
      }
      const data = await response.json();
      setStrategies(data.data || []);
    } catch (e) {
      console.error('Failed to fetch strategies for filter', e);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleFilterChange = useCallback((newFilters: OrderFilters) => {
    setPagination(p => ({ ...p, page: 1 })); // Reset to first page on filter change
    setFilters(newFilters);
  }, []);

  const handlePageChange = (newPage: number) => {
    setPagination(p => ({ ...p, page: newPage }));
  };

  const handleLimitChange = (newLimit: number) => {
    setPagination(p => ({ ...p, limit: newLimit, page: 1 })); // 페이지 크기 변경 시 첫 페이지로
  };

  return {
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
    refreshOrders: fetchOrders,
  };
}
