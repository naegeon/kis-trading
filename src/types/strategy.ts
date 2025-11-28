import { strategies, strategyStatusEnum } from '@/lib/db/schema';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// Inferred types from the 'strategies' table
export type Strategy = InferSelectModel<typeof strategies>;
export type NewStrategy = InferInsertModel<typeof strategies>;
export type StrategyStatus = typeof strategyStatusEnum.enumValues[number];

// Specific parameter types based on DEVELOPMENT_PLAN.md

export type SplitOrderParams = {
  basePrice: number;
  declineValue: number;
  declineUnit: 'USD' | 'PERCENT';
  splitCount: number;
  distributionType: 'PYRAMID' | 'EQUAL' | 'INVERTED';
  totalAmount: number;
  side: 'BUY' | 'SELL';

  // 평단가 추적 (매수 후 자동 업데이트)
  currentAvgCost?: number;
  currentQty?: number;

  // 목표 수익률 (매도 시 사용)
  targetReturnRate?: number;

  // 주간매매 플래그 (미국 주간장 10:00~18:00)
  isDaytime?: boolean;

  // 거래소 코드 (미국 시장만 해당: NASD, NYSE, AMEX)
  exchangeCode?: 'NASD' | 'NYSE' | 'AMEX';

  // 이미 처리된 주문 ID 목록 (중복 평단가 계산 방지)
  processedOrderIds?: string[];
};


// LOO/LOC Strategy Parameters (PRD.md Day 17-18)
export type LooLocStrategyParams = {
  // [DEPRECATED] 최초 매수 - 더 이상 사용하지 않음 (KIS API 보유 조회로 대체)
  // 기존 데이터 호환성을 위해 optional로 유지
  initialBuyQty?: number;
  initialBuyPrice?: number;
  isFirstExecution?: boolean;

  // LOO (Limit-on-Open) 매수
  looEnabled: boolean;
  looQty: number;

  // LOC (Limit-on-Close) 추가 매수
  locBuyEnabled: boolean;
  locBuyQty: number;

  // 목표 수익률 (익절 기준)
  targetReturnRate: number;

  // Runtime state (평단가 관리) - KIS API에서 조회하므로 더 이상 사용하지 않음
  currentAvgCost?: number;
  currentQty?: number;

  // 거래소 코드 (미국 시장만 해당: NASD, NYSE, AMEX)
  exchangeCode?: 'NASD' | 'NYSE' | 'AMEX';
};

// A union type for strategy parameters for type-safe handling
export type StrategyParameters = SplitOrderParams | LooLocStrategyParams;

// Type for strategies that include the user relation
import { UserWithCredentials } from './user';

export type StrategyWithUser = Strategy & {
  user: UserWithCredentials;
};

// Extended strategy type with additional display information
export type StrategyWithDetails = Strategy & {
  symbolName?: string | null; // 종목명
  filledOrdersCount?: number; // 체결된 주문 수
  totalOrdersCount?: number; // 전체 주문 수
};
