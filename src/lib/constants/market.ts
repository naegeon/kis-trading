/**
 * 시장 관련 상수
 * Phase 5: 상수 통합 - 시장 시간, 시간대 관련 상수
 */

// ============================================================================
// 시간대 관련 상수
// ============================================================================

/**
 * 한국 시간 UTC 오프셋 (분)
 * UTC+9 = 9시간 = 540분
 */
export const KST_OFFSET_MINUTES = 9 * 60; // 540분

/**
 * 하루의 분 수
 */
export const MINUTES_IN_DAY = 24 * 60; // 1440분

/**
 * 미국 동부 시간 UTC 오프셋 (시간)
 * 서머타임(DST) 적용 여부에 따라 다름
 */
export const US_EASTERN_OFFSET = {
  DST: -4,      // 서머타임 적용 시 (3월~11월)
  STANDARD: -5, // 표준시 (11월~3월)
} as const;

// ============================================================================
// 미국 시장 시간 (한국 시간 기준, 분 단위)
// ============================================================================

/**
 * 서머타임(DST) 적용 시 미국 시장 시간 (한국 시간 기준)
 * 3월 둘째 일요일 ~ 11월 첫째 일요일
 */
export const US_MARKET_HOURS_DST = {
  /** 프리마켓 시작: 17:00 KST */
  PRE_MARKET_START: 17 * 60, // 1020분
  /** 정규장 시작: 22:30 KST */
  REGULAR_MARKET_START: 22 * 60 + 30, // 1350분
  /** 정규장 종료: 05:00 KST (다음날) */
  REGULAR_MARKET_END: 5 * 60, // 300분
  /** 애프터마켓 종료: 09:00 KST (다음날) */
  AFTER_MARKET_END: 9 * 60, // 540분
  /** 정규장 시작 시간 문자열 */
  REGULAR_MARKET_OPEN_STR: '22:30',
  /** 정규장 종료 시간 문자열 */
  REGULAR_MARKET_CLOSE_STR: '05:00',
  /** 프리마켓 시간 문자열 */
  PRE_MARKET_STR: '17:00~22:30',
} as const;

/**
 * 겨울시간(표준시) 적용 시 미국 시장 시간 (한국 시간 기준)
 * 11월 첫째 일요일 ~ 3월 둘째 일요일
 */
export const US_MARKET_HOURS_STANDARD = {
  /** 프리마켓 시작: 18:00 KST */
  PRE_MARKET_START: 18 * 60, // 1080분
  /** 정규장 시작: 23:30 KST */
  REGULAR_MARKET_START: 23 * 60 + 30, // 1410분
  /** 정규장 종료: 06:00 KST (다음날) */
  REGULAR_MARKET_END: 6 * 60, // 360분
  /** 애프터마켓 종료: 10:00 KST (다음날) */
  AFTER_MARKET_END: 10 * 60, // 600분
  /** 정규장 시작 시간 문자열 */
  REGULAR_MARKET_OPEN_STR: '23:30',
  /** 정규장 종료 시간 문자열 */
  REGULAR_MARKET_CLOSE_STR: '06:00',
  /** 프리마켓 시간 문자열 */
  PRE_MARKET_STR: '18:00~23:30',
} as const;

/**
 * DST 여부에 따른 시장 시간 반환
 */
export function getUSMarketHours(isDST: boolean) {
  return isDST ? US_MARKET_HOURS_DST : US_MARKET_HOURS_STANDARD;
}

// ============================================================================
// LOO/LOC 관련 상수
// ============================================================================

/**
 * LOC 평가 대기 시간 (분)
 * 정규장 시작 후 LOO 체결 확인을 위해 대기하는 시간
 */
export const LOC_EVALUATION_WAIT_MINUTES = 10;

/**
 * 정규장이 아닐 때 반환하는 큰 양수 값
 * getMinutesSinceRegularMarketOpen에서 사용
 */
export const MARKET_CLOSED_INDICATOR = 999;

// ============================================================================
// 서머타임 계산 관련 상수
// ============================================================================

/**
 * 서머타임 시작 시간 (3월 둘째 일요일 02:00 EST)
 * UTC 기준 07:00 (표준시 기준 EST는 UTC-5)
 */
export const DST_START_HOUR_UTC = 7;

/**
 * 서머타임 종료 시간 (11월 첫째 일요일 02:00 EDT)
 * UTC 기준 06:00 (DST 기준 EDT는 UTC-4)
 */
export const DST_END_HOUR_UTC = 6;

// ============================================================================
// 요일 상수
// ============================================================================

/**
 * 요일 상수 (JavaScript Date.getDay() 기준)
 */
export const DAY_OF_WEEK = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

/**
 * 주말 요일
 */
export const WEEKEND_DAYS = [DAY_OF_WEEK.SATURDAY, DAY_OF_WEEK.SUNDAY] as const;

// ============================================================================
// 월 상수 (JavaScript Date.getMonth() 기준, 0-indexed)
// ============================================================================

export const MONTH = {
  JANUARY: 0,
  FEBRUARY: 1,
  MARCH: 2,
  APRIL: 3,
  MAY: 4,
  JUNE: 5,
  JULY: 6,
  AUGUST: 7,
  SEPTEMBER: 8,
  OCTOBER: 9,
  NOVEMBER: 10,
  DECEMBER: 11,
} as const;
