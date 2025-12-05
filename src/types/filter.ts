import type { OrderStatus } from './order';

export interface OrderFilters {
  strategyId?: string;
  statuses: OrderStatus[];
  startDate?: Date;
  endDate?: Date;
}
