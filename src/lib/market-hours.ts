/**
 * 미국 주식 시장 시간 유틸리티
 * 서머타임(DST)을 자동으로 감지하여 정확한 시장 시간을 제공합니다.
 */

import {
  KST_OFFSET_MINUTES,
  MINUTES_IN_DAY,
  US_EASTERN_OFFSET,
  getUSMarketHours,
  LOC_EVALUATION_WAIT_MINUTES,
  MARKET_CLOSED_INDICATOR,
  DST_START_HOUR_UTC,
  DST_END_HOUR_UTC,
  DAY_OF_WEEK,
  MONTH,
} from './constants/market';

/**
 * 미국 서머타임(DST) 적용 여부를 확인합니다.
 * 서머타임: 3월 둘째 일요일 02:00 ~ 11월 첫째 일요일 02:00 (미국 동부 시간)
 * @param date 확인할 날짜 (기본값: 현재)
 * @returns 서머타임 적용 여부
 */
export function isUSDaylightSavingTime(date: Date = new Date()): boolean {
  const year = date.getUTCFullYear();

  // 3월 둘째 일요일 계산 (서머타임 시작) - UTC 기준
  const marchFirst = new Date(Date.UTC(year, MONTH.MARCH, 1)); // 3월 1일 UTC
  const marchFirstDay = marchFirst.getUTCDay();
  const secondSundayMarchDay = 8 + (7 - marchFirstDay) % 7;
  // 미국 동부 02:00 = UTC 07:00 (표준시 기준)
  const secondSundayMarch = new Date(Date.UTC(year, MONTH.MARCH, secondSundayMarchDay, DST_START_HOUR_UTC, 0, 0));

  // 11월 첫째 일요일 계산 (서머타임 종료) - UTC 기준
  const novemberFirst = new Date(Date.UTC(year, MONTH.NOVEMBER, 1)); // 11월 1일 UTC
  const novemberFirstDay = novemberFirst.getUTCDay();
  const firstSundayNovemberDay = 1 + (7 - novemberFirstDay) % 7;
  // 미국 동부 02:00 = UTC 06:00 (DST 기준)
  const firstSundayNovember = new Date(Date.UTC(year, MONTH.NOVEMBER, firstSundayNovemberDay, DST_END_HOUR_UTC, 0, 0));

  // 현재 날짜가 서머타임 기간인지 확인
  return date >= secondSundayMarch && date < firstSundayNovember;
}

/**
 * 미국 주식 시장 시간 정보를 반환합니다. (한국 시간 기준)
 *
 * 정규장 시간:
 * - 서머타임: 22:30 ~ 05:00 (다음날)
 * - 겨울시간: 23:30 ~ 06:00 (다음날)
 *
 * 프리마켓 시간:
 * - 서머타임: 17:00 ~ 22:30
 * - 겨울시간: 18:00 ~ 23:30
 *
 * 애프터마켓 시간:
 * - 서머타임: 05:00 ~ 09:00
 * - 겨울시간: 06:00 ~ 10:00
 */
export interface USMarketHours {
  isDST: boolean;                    // 서머타임 적용 여부
  isPreMarket: boolean;              // 프리마켓 시간 여부
  isRegularMarket: boolean;          // 정규장 시간 여부
  isAfterMarket: boolean;            // 애프터마켓 시간 여부
  isMarketOpen: boolean;             // 시장 열림 여부 (프리마켓 + 정규장 + 애프터마켓)
  canSubmitLOO: boolean;             // LOO 주문 제출 가능 여부 (프리마켓)
  canSubmitLOC: boolean;             // LOC 주문 제출 가능 여부 (정규장)
  currentSession: 'CLOSED' | 'PRE_MARKET' | 'REGULAR' | 'AFTER_MARKET';
  regularMarketOpen: string;         // 정규장 시작 시간 (한국 시간)
  regularMarketClose: string;        // 정규장 종료 시간 (한국 시간)
}

/**
 * 현재 미국 주식 시장 상태를 반환합니다. (한국 시간 기준)
 * @param date 확인할 날짜/시간 (기본값: 현재)
 * @returns 시장 상태 정보
 */
export function getUSMarketStatus(date: Date = new Date()): USMarketHours {
  const isDST = isUSDaylightSavingTime(date);

  // UTC를 한국 시간(KST, UTC+9)으로 변환
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const kstMinutes = (utcMinutes + KST_OFFSET_MINUTES) % MINUTES_IN_DAY;

  // 한국 시간 기준 시간 구하기
  const hour = Math.floor(kstMinutes / 60);
  const minute = kstMinutes % 60;
  const timeInMinutes = hour * 60 + minute;

  // 시간 기준점 (분 단위, 한국 시간)
  const marketHours = getUSMarketHours(isDST);
  const preMarketStart = marketHours.PRE_MARKET_START;
  const regularMarketStart = marketHours.REGULAR_MARKET_START;
  const regularMarketEnd = marketHours.REGULAR_MARKET_END;
  const afterMarketEnd = marketHours.AFTER_MARKET_END;

  // 시간대별 상태 판단
  let isPreMarket = false;
  let isRegularMarket = false;
  let isAfterMarket = false;

  // 프리마켓: preMarketStart ~ regularMarketStart
  if (timeInMinutes >= preMarketStart && timeInMinutes < regularMarketStart) {
    isPreMarket = true;
  }

  // 정규장: regularMarketStart ~ 자정 또는 0 ~ regularMarketEnd
  if (timeInMinutes >= regularMarketStart || timeInMinutes < regularMarketEnd) {
    isRegularMarket = true;
  }

  // 애프터마켓: regularMarketEnd ~ afterMarketEnd
  if (timeInMinutes >= regularMarketEnd && timeInMinutes < afterMarketEnd) {
    isAfterMarket = true;
  }

  // 세션 판단
  let currentSession: USMarketHours['currentSession'] = 'CLOSED';
  if (isPreMarket) currentSession = 'PRE_MARKET';
  else if (isRegularMarket) currentSession = 'REGULAR';
  else if (isAfterMarket) currentSession = 'AFTER_MARKET';

  const isMarketOpen = isPreMarket || isRegularMarket || isAfterMarket;

  // LOO는 프리마켓에서 제출 가능
  // LOC는 정규장에서 제출 가능
  const canSubmitLOO = isPreMarket;
  const canSubmitLOC = isRegularMarket;

  // 정규장 시간 문자열
  const regularMarketOpen = marketHours.REGULAR_MARKET_OPEN_STR;
  const regularMarketClose = marketHours.REGULAR_MARKET_CLOSE_STR;

  return {
    isDST,
    isPreMarket,
    isRegularMarket,
    isAfterMarket,
    isMarketOpen,
    canSubmitLOO,
    canSubmitLOC,
    currentSession,
    regularMarketOpen,
    regularMarketClose,
  };
}

/**
 * 주말 여부를 확인합니다. (미국 시장 기준)
 * @param date 확인할 날짜 (기본값: 현재)
 * @returns 주말 여부
 */
export function isUSWeekend(date: Date = new Date()): boolean {
  // UTC에서 미국 동부 시간으로 변환
  const isDST = isUSDaylightSavingTime(date);
  const usEasternOffsetHours = isDST ? US_EASTERN_OFFSET.DST : US_EASTERN_OFFSET.STANDARD;

  const usEasternTime = new Date(date.getTime() + usEasternOffsetHours * 60 * 60 * 1000);
  const dayOfWeek = usEasternTime.getUTCDay(); // UTC 기준 요일 사용

  return dayOfWeek === DAY_OF_WEEK.SUNDAY || dayOfWeek === DAY_OF_WEEK.SATURDAY;
}

/**
 * LOO/LOC 주문 가능 여부를 확인합니다.
 * @param orderType 주문 타입 ('LOO' | 'LOC')
 * @param date 확인할 날짜/시간 (기본값: 현재)
 * @returns 주문 가능 여부와 상세 정보
 */
export function canSubmitLooLocOrder(
  orderType: 'LOO' | 'LOC',
  date: Date = new Date()
): { canSubmit: boolean; reason: string; marketStatus: USMarketHours } {
  const marketStatus = getUSMarketStatus(date);

  // 주말 체크
  if (isUSWeekend(date)) {
    return {
      canSubmit: false,
      reason: '주말에는 미국 시장이 휴장입니다.',
      marketStatus,
    };
  }

  const marketHours = getUSMarketHours(marketStatus.isDST);

  if (orderType === 'LOO') {
    if (marketStatus.canSubmitLOO) {
      return {
        canSubmit: true,
        reason: '프리마켓 시간입니다. LOO 주문 제출 가능합니다.',
        marketStatus,
      };
    } else {
      return {
        canSubmit: false,
        reason: `LOO 주문은 프리마켓 시간(${marketHours.PRE_MARKET_STR})에만 제출 가능합니다. 현재: ${marketStatus.currentSession}`,
        marketStatus,
      };
    }
  } else {
    // LOC
    if (marketStatus.canSubmitLOC) {
      return {
        canSubmit: true,
        reason: '정규장 시간입니다. LOC 주문 제출 가능합니다.',
        marketStatus,
      };
    } else {
      return {
        canSubmit: false,
        reason: `LOC 주문은 정규장 시간(${marketStatus.regularMarketOpen}~${marketStatus.regularMarketClose})에만 제출 가능합니다. 현재: ${marketStatus.currentSession}`,
        marketStatus,
      };
    }
  }
}

/**
 * 정규장 시작 후 경과 시간(분)을 반환합니다.
 * @param date 확인할 날짜/시간 (기본값: 현재)
 * @returns 정규장 시작 후 경과 시간(분), 정규장 전이면 음수, 정규장 후 다음날이면 큰 양수
 */
export function getMinutesSinceRegularMarketOpen(date: Date = new Date()): number {
  const isDST = isUSDaylightSavingTime(date);

  // UTC를 한국 시간(KST, UTC+9)으로 변환
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const kstMinutes = (utcMinutes + KST_OFFSET_MINUTES) % MINUTES_IN_DAY;

  const hour = Math.floor(kstMinutes / 60);
  const minute = kstMinutes % 60;
  const timeInMinutes = hour * 60 + minute;

  // 정규장 시작 시간 (한국 시간 기준)
  const marketHours = getUSMarketHours(isDST);
  const regularMarketStart = marketHours.REGULAR_MARKET_START;
  const regularMarketEnd = marketHours.REGULAR_MARKET_END;

  // 자정 이전 (정규장 시작 후)
  if (timeInMinutes >= regularMarketStart) {
    return timeInMinutes - regularMarketStart;
  }

  // 자정 이후 ~ 정규장 종료 전 (다음날 새벽)
  if (timeInMinutes < regularMarketEnd) {
    // 자정 이후이므로 전날 정규장 시작부터 경과 시간 계산
    // (24시간 - 정규장시작시간) + 현재시간
    return (MINUTES_IN_DAY - regularMarketStart) + timeInMinutes;
  }

  // 정규장 종료 후 ~ 다음 프리마켓 시작 전 (장 마감 후)
  // 이 경우는 정규장이 아니므로 큰 양수 반환
  return MARKET_CLOSED_INDICATOR;
}

/**
 * LOC 주문 평가가 가능한지 확인합니다.
 * LOO 체결 확인을 위해 정규장 시작 후 10분이 경과해야 합니다.
 * @param date 확인할 날짜/시간 (기본값: 현재)
 * @returns LOC 평가 가능 여부
 */
export function canEvaluateLOC(date: Date = new Date()): boolean {
  const marketStatus = getUSMarketStatus(date);

  // 정규장이 아니면 false
  if (!marketStatus.isRegularMarket) {
    return false;
  }

  // 정규장 시작 후 10분 이상 경과해야 LOC 평가 가능
  const minutesSinceOpen = getMinutesSinceRegularMarketOpen(date);
  return minutesSinceOpen >= LOC_EVALUATION_WAIT_MINUTES;
}
