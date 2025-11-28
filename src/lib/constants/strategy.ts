/**
 * 전략 관련 상수 (중앙 관리)
 * 전략 타입 레이블, 상태 레이블 등을 한 곳에서 관리합니다.
 */

// 전략 타입 레이블 (UI 표시용)
export const STRATEGY_TYPE_LABELS: Record<string, string> = {
  SPLIT_ORDER: '분할매매',
  LOO_LOC: '앞뒤로',
} as const;

// 전략 타입 레이블 (전체 이름)
export const STRATEGY_TYPE_FULL_LABELS: Record<string, string> = {
  SPLIT_ORDER: '분할매매 전략',
  LOO_LOC: '앞뒤로 전략',
} as const;

// 전략 상태 레이블
export const STRATEGY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '활성',
  INACTIVE: '비활성',
  ENDED: '종료',
} as const;

// 주문 상태 레이블 (한국어)
export const ORDER_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: '대기',
  FILLED: '체결',
  PARTIALLY_FILLED: '부분체결',
  CANCELLED: '취소',
  FAILED: '실패',
} as const;

// 시장 레이블
export const MARKET_LABELS: Record<string, string> = {
  US: '미국',
  KR: '한국',
} as const;

// 주문 타입 레이블
export const ORDER_TYPE_LABELS: Record<string, string> = {
  MARKET: '시장가',
  LIMIT: '지정가',
  LOO: 'LOO',
  LOC: 'LOC',
} as const;

// 분배 방식 레이블
export const DISTRIBUTION_TYPE_LABELS: Record<string, string> = {
  EQUAL: '균등',
  PYRAMID: '삼각형',
  INVERTED: '역삼각형',
} as const;

// 헬퍼 함수: 전략 타입 레이블 가져오기
export function getStrategyTypeLabel(type: string): string {
  return STRATEGY_TYPE_LABELS[type] || type;
}

// 헬퍼 함수: 전략 타입 전체 레이블 가져오기
export function getStrategyTypeFullLabel(type: string): string {
  return STRATEGY_TYPE_FULL_LABELS[type] || type;
}

// 헬퍼 함수: 주문 상태 레이블 가져오기
export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] || status;
}

// 헬퍼 함수: 시장 레이블 가져오기
export function getMarketLabel(market: string): string {
  return MARKET_LABELS[market] || market;
}
