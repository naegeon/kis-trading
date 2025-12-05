/**
 * 트레이딩 관련 상수
 * Phase 5: 상수 통합 - 매직 넘버 제거 및 설정값 중앙 관리
 */

// ============================================================================
// 전략 실행 관련 상수
// ============================================================================

/**
 * 전략 실행 간격 (밀리초)
 * 크론잡에서 10분마다 실행되며, 중복 실행 방지에 사용
 */
export const STRATEGY_EXECUTION_INTERVAL_MS = 10 * 60 * 1000; // 10분

/**
 * 즉시 실행 타임아웃 (밀리초)
 * 전략 생성/수정 시 즉시 실행의 최대 대기 시간
 */
export const IMMEDIATE_EXECUTION_TIMEOUT_MS = 10000; // 10초

/**
 * 기본 목표 수익률 (%)
 * 전략에서 별도 지정하지 않은 경우 사용
 */
export const DEFAULT_TARGET_RETURN_RATE = 10; // 10%

// ============================================================================
// 가격 관련 상수
// ============================================================================

/**
 * 미국 주식 가격 소수점 자릿수
 * KIS API는 $1 이상 미국 주식에 대해 소수점 2자리까지만 허용
 */
export const US_PRICE_DECIMALS = 2;

/**
 * 미국 주식 가격 반올림 배수
 */
export const US_PRICE_MULTIPLIER = 100; // 10^2

// ============================================================================
// 한국 주식 호가 단위
// ============================================================================

/**
 * 한국 주식 호가 단위 테이블
 * 가격 구간별 호가 단위를 정의
 * [상한가격, 호가단위] 형태
 */
export const KR_TICK_SIZE_TABLE: ReadonlyArray<readonly [number, number]> = [
  [2000, 1],      // 2,000원 미만: 1원
  [5000, 5],      // 5,000원 미만: 5원
  [20000, 10],    // 20,000원 미만: 10원
  [50000, 50],    // 50,000원 미만: 50원
  [200000, 100],  // 200,000원 미만: 100원
  [500000, 500],  // 500,000원 미만: 500원
  [Infinity, 1000], // 500,000원 이상: 1,000원
] as const;

// ============================================================================
// 거래소 코드 매핑
// ============================================================================

/**
 * KIS API 주문용 거래소 코드
 * 주문 제출 시 사용 (예: 'NASD', 'NYSE', 'AMEX')
 */
export const EXCHANGE_CODES = {
  NASDAQ: 'NASD',
  NYSE: 'NYSE',
  AMEX: 'AMEX',
} as const;

/**
 * KIS API 시세 조회용 거래소 코드
 * 주문 코드와 시세 조회 코드가 다름
 */
export const EXCHANGE_CODES_FOR_PRICE = {
  NASD: 'NAS',
  NYSE: 'NYS',
  AMEX: 'AMS',
} as const;

/**
 * 거래소 코드 변환 함수
 * 주문용 코드를 시세 조회용 코드로 변환
 */
export function getExchangeCodeForPrice(orderCode: string): string {
  return EXCHANGE_CODES_FOR_PRICE[orderCode as keyof typeof EXCHANGE_CODES_FOR_PRICE] || 'NAS';
}

// ============================================================================
// 미국 거래소 목록
// ============================================================================

/**
 * 미국 주식 거래소 목록
 * 잔고 조회 시 모든 거래소를 순회
 */
export const US_EXCHANGES = ['NASD', 'NYSE', 'AMEX'] as const;

// ============================================================================
// 주문 상태 관련 상수
// ============================================================================

/**
 * 주문 상태 (내부 사용)
 */
export const ORDER_STATUS = {
  SUBMITTED: 'SUBMITTED',
  FILLED: 'FILLED',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
} as const;

/**
 * 전략 상태
 */
export const STRATEGY_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ENDED: 'ENDED',
} as const;

/**
 * 전략 타입
 */
export const STRATEGY_TYPE = {
  SPLIT_ORDER: 'SPLIT_ORDER',
  LOO_LOC: 'LOO_LOC',
} as const;

/**
 * 분배 타입
 */
export const DISTRIBUTION_TYPE = {
  EQUAL: 'EQUAL',
  PYRAMID: 'PYRAMID',
  INVERTED: 'INVERTED',
} as const;

/**
 * 주문 측면 (매수/매도)
 */
export const ORDER_SIDE = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;

/**
 * 시장 구분
 */
export const MARKET = {
  US: 'US',
  KR: 'KR',
} as const;

// ============================================================================
// 주문 이력 조회 관련
// ============================================================================

/**
 * 주문 이력 조회 기간 (일)
 * KIS API 주문체결내역 조회 시 사용
 */
export const ORDER_HISTORY_DAYS = 7;
