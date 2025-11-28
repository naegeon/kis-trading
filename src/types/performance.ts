import { performanceMetrics } from "@/lib/db/schema";

// Type for data inferred from the performance_metrics table schema
export type PerformanceMetric = typeof performanceMetrics.$inferSelect;

export interface PortfolioMetrics {
  totalValue: number;
  totalInvested: number;
  realizedPnl: number;
  unrealizedPnl: number;
  returnRate: number;
  tradeCount: number;
  cashBalance: number;
}

export interface StrategyMetrics extends PortfolioMetrics {
  strategyId: string;
  strategyName: string;
  symbol?: string;
  symbolName?: string | null;
}
