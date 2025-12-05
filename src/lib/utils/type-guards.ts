/**
 * Type Guards - 런타임 타입 안전성을 위한 타입 가드 함수들
 *
 * 이 파일은 `as` 타입 단언을 대체하여 런타임에 타입을 검증합니다.
 * 모든 타입 가드는 TypeScript의 타입 좁히기(type narrowing)를 지원합니다.
 */

import type { SplitOrderParams, LooLocStrategyParams } from '@/types/strategy';

// ============================================================================
// Strategy Parameter Type Guards
// ============================================================================

/**
 * SplitOrderParams 타입 가드
 * 분할주문 전략 파라미터인지 검증합니다.
 */
export function isSplitOrderParams(params: unknown): params is SplitOrderParams {
  if (!params || typeof params !== 'object') {
    return false;
  }

  const p = params as Record<string, unknown>;

  // 필수 필드 검증
  if (typeof p.basePrice !== 'number' || !isFinite(p.basePrice)) return false;
  if (typeof p.declineValue !== 'number' || !isFinite(p.declineValue)) return false;
  if (p.declineUnit !== 'USD' && p.declineUnit !== 'PERCENT') return false;
  if (typeof p.splitCount !== 'number' || !Number.isInteger(p.splitCount) || p.splitCount < 1) return false;
  if (p.distributionType !== 'PYRAMID' && p.distributionType !== 'EQUAL' && p.distributionType !== 'INVERTED') return false;
  if (typeof p.totalAmount !== 'number' || !isFinite(p.totalAmount)) return false;
  if (p.side !== 'BUY' && p.side !== 'SELL') return false;

  // 선택적 필드 검증 (있으면 타입 확인)
  if (p.currentAvgCost !== undefined && (typeof p.currentAvgCost !== 'number' || !isFinite(p.currentAvgCost))) return false;
  if (p.currentQty !== undefined && (typeof p.currentQty !== 'number' || !isFinite(p.currentQty))) return false;
  if (p.targetReturnRate !== undefined && (typeof p.targetReturnRate !== 'number' || !isFinite(p.targetReturnRate))) return false;
  if (p.isDaytime !== undefined && typeof p.isDaytime !== 'boolean') return false;
  if (p.exchangeCode !== undefined && p.exchangeCode !== 'NASD' && p.exchangeCode !== 'NYSE' && p.exchangeCode !== 'AMEX') return false;
  if (p.processedOrderIds !== undefined && (!Array.isArray(p.processedOrderIds) || !p.processedOrderIds.every(id => typeof id === 'string'))) return false;

  return true;
}

/**
 * LooLocStrategyParams 타입 가드
 * LOO/LOC 전략 파라미터인지 검증합니다.
 */
export function isLooLocParams(params: unknown): params is LooLocStrategyParams {
  if (!params || typeof params !== 'object') {
    return false;
  }

  const p = params as Record<string, unknown>;

  // 필수 필드 검증
  if (typeof p.looEnabled !== 'boolean') return false;
  if (typeof p.looQty !== 'number' || !isFinite(p.looQty)) return false;
  if (typeof p.locBuyEnabled !== 'boolean') return false;
  if (typeof p.locBuyQty !== 'number' || !isFinite(p.locBuyQty)) return false;
  if (typeof p.targetReturnRate !== 'number' || !isFinite(p.targetReturnRate)) return false;

  // 선택적 필드 검증 (deprecated 포함)
  if (p.initialBuyQty !== undefined && (typeof p.initialBuyQty !== 'number' || !isFinite(p.initialBuyQty))) return false;
  if (p.initialBuyPrice !== undefined && (typeof p.initialBuyPrice !== 'number' || !isFinite(p.initialBuyPrice))) return false;
  if (p.isFirstExecution !== undefined && typeof p.isFirstExecution !== 'boolean') return false;
  if (p.currentAvgCost !== undefined && (typeof p.currentAvgCost !== 'number' || !isFinite(p.currentAvgCost))) return false;
  if (p.currentQty !== undefined && (typeof p.currentQty !== 'number' || !isFinite(p.currentQty))) return false;
  if (p.exchangeCode !== undefined && p.exchangeCode !== 'NASD' && p.exchangeCode !== 'NYSE' && p.exchangeCode !== 'AMEX') return false;

  return true;
}

/**
 * 전략 파라미터 타입을 판별하고 반환합니다.
 * 유효하지 않은 경우 null을 반환합니다.
 */
export function parseStrategyParams(
  params: unknown,
  strategyType: 'SPLIT_ORDER' | 'LOO_LOC'
): SplitOrderParams | LooLocStrategyParams | null {
  if (strategyType === 'SPLIT_ORDER') {
    return isSplitOrderParams(params) ? params : null;
  } else if (strategyType === 'LOO_LOC') {
    return isLooLocParams(params) ? params : null;
  }
  return null;
}

// ============================================================================
// Market Type Guards
// ============================================================================

/**
 * 유효한 시장 코드인지 검증합니다.
 */
export function isValidMarket(market: unknown): market is 'US' | 'KR' {
  return market === 'US' || market === 'KR';
}

/**
 * 유효한 거래소 코드인지 검증합니다. (미국 시장)
 */
export function isValidExchangeCode(code: unknown): code is 'NASD' | 'NYSE' | 'AMEX' {
  return code === 'NASD' || code === 'NYSE' || code === 'AMEX';
}

/**
 * 유효한 전략 상태인지 검증합니다.
 */
export function isValidStrategyStatus(status: unknown): status is 'ACTIVE' | 'INACTIVE' | 'ENDED' {
  return status === 'ACTIVE' || status === 'INACTIVE' || status === 'ENDED';
}

/**
 * 유효한 전략 타입인지 검증합니다.
 */
export function isValidStrategyType(type: unknown): type is 'SPLIT_ORDER' | 'LOO_LOC' {
  return type === 'SPLIT_ORDER' || type === 'LOO_LOC';
}

/**
 * 유효한 주문 방향인지 검증합니다.
 */
export function isValidOrderSide(side: unknown): side is 'BUY' | 'SELL' {
  return side === 'BUY' || side === 'SELL';
}

/**
 * 유효한 분배 타입인지 검증합니다.
 */
export function isValidDistributionType(type: unknown): type is 'PYRAMID' | 'EQUAL' | 'INVERTED' {
  return type === 'PYRAMID' || type === 'EQUAL' || type === 'INVERTED';
}

// ============================================================================
// KIS API Response Type Guards
// ============================================================================

/**
 * KIS API 기본 응답 구조 검증
 */
export interface KISBaseResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
}

export function isKISBaseResponse(response: unknown): response is KISBaseResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  const r = response as Record<string, unknown>;
  return (
    typeof r.rt_cd === 'string' &&
    typeof r.msg_cd === 'string' &&
    typeof r.msg1 === 'string'
  );
}

/**
 * KIS API 성공 응답인지 검증합니다.
 */
export function isKISSuccessResponse(response: unknown): boolean {
  return isKISBaseResponse(response) && response.rt_cd === '0';
}

/**
 * KIS 주문 응답 output 검증
 */
export interface KISOrderOutput {
  ODNO?: string;      // 주문번호
  ORD_TMD?: string;   // 주문시각
  KRX_FWDG_ORD_ORGNO?: string;
  ODNO_ECLS?: string; // 해외 주문번호
}

export function isKISOrderOutput(output: unknown): output is KISOrderOutput {
  if (!output || typeof output !== 'object') {
    return false;
  }

  const o = output as Record<string, unknown>;

  // ODNO 또는 ODNO_ECLS 중 하나는 있어야 함
  const hasOrderNo = typeof o.ODNO === 'string' || typeof o.ODNO_ECLS === 'string';

  return hasOrderNo;
}

/**
 * KIS 해외 잔고 output1 검증
 */
export interface KISOverseasHoldingItem {
  ovrs_pdno: string;      // 종목코드
  ovrs_item_name: string; // 종목명
  ovrs_cblc_qty: string;  // 잔고수량
  pchs_avg_pric: string;  // 평균매입가
  frcr_evlu_pfls_amt: string; // 평가손익
  evlu_pfls_rt: string;   // 수익률
  now_pric2: string;      // 현재가
}

export function isKISOverseasHoldingItem(item: unknown): item is KISOverseasHoldingItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const i = item as Record<string, unknown>;
  return (
    typeof i.ovrs_pdno === 'string' &&
    typeof i.ovrs_item_name === 'string' &&
    typeof i.ovrs_cblc_qty === 'string' &&
    typeof i.pchs_avg_pric === 'string'
  );
}

/**
 * KIS 국내 잔고 output1 검증
 */
export interface KISDomesticHoldingItem {
  pdno: string;           // 종목코드
  prdt_name: string;      // 종목명
  hldg_qty: string;       // 보유수량
  pchs_avg_pric: string;  // 평균매입가
  evlu_pfls_amt: string;  // 평가손익
  evlu_pfls_rt: string;   // 수익률
  prpr: string;           // 현재가
}

export function isKISDomesticHoldingItem(item: unknown): item is KISDomesticHoldingItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const i = item as Record<string, unknown>;
  return (
    typeof i.pdno === 'string' &&
    typeof i.prdt_name === 'string' &&
    typeof i.hldg_qty === 'string' &&
    typeof i.pchs_avg_pric === 'string'
  );
}

// ============================================================================
// Utility Type Guards
// ============================================================================

/**
 * null이 아닌 객체인지 검증합니다.
 */
export function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 유효한 숫자인지 검증합니다. (NaN, Infinity 제외)
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

/**
 * 양수인지 검증합니다.
 */
export function isPositiveNumber(value: unknown): value is number {
  return isValidNumber(value) && value > 0;
}

/**
 * 0 이상의 숫자인지 검증합니다.
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isValidNumber(value) && value >= 0;
}

/**
 * 비어있지 않은 문자열인지 검증합니다.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 유효한 UUID인지 검증합니다.
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * 유효한 날짜 문자열인지 검증합니다. (YYYY-MM-DD 형식)
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;

  const date = new Date(value);
  return !isNaN(date.getTime());
}
