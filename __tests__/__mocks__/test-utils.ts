/**
 * 테스트 유틸리티
 */

// 시간 관련 헬퍼
export const TimeHelper = {
  // PRE_MARKET (한국시간 07:00 - 22:59)
  setPreMarket(): Date {
    const now = new Date();
    now.setHours(21, 0, 0, 0); // 오후 9시 (PRE_MARKET)
    return now;
  },

  // MARKET_OPEN (한국시간 23:30 - 06:00)
  setMarketOpen(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // 자정 (MARKET_OPEN)
    return now;
  },

  // MARKET_CLOSE (한국시간 06:00 이후)
  setMarketClose(): Date {
    const now = new Date();
    now.setHours(7, 0, 0, 0); // 오전 7시 (장 마감 직후)
    return now;
  },

  // 오늘 시작
  getTodayStart(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  },

  // 어제
  getYesterday(): Date {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  },
};

// US 시장 시간 체크 (sync-order-status에서 사용하는 것과 동일한 로직)
export function isUSMarketOpen(date: Date = new Date()): boolean {
  const kstHour = date.getHours();
  const kstMinute = date.getMinutes();
  // US 정규장: 23:30 ~ 06:00 KST
  return (kstHour >= 23 && kstMinute >= 30) || (kstHour < 6);
}

// US 시장 마감 체크
export function isUSMarketClosed(date: Date = new Date()): boolean {
  const kstHour = date.getHours();
  const kstMinute = date.getMinutes();
  // 07:00-22:59는 마감 시간대
  if (kstHour >= 7 && kstHour < 23) return true;
  // 23시인데 30분 이전이면 마감
  if (kstHour === 23 && kstMinute < 30) return true;
  return false;
}

// LOO/LOC 주문 제출 가능 시간 체크
export function canSubmitLOO(date: Date = new Date()): boolean {
  const kstHour = date.getHours();
  // PRE_MARKET (대략 한국시간 18:00 - 23:30)
  return kstHour >= 18 && kstHour < 23;
}

// 테스트 assertion 헬퍼
export const Assertions = {
  orderIsSubmitted(order: { status: string }): void {
    if (order.status !== 'SUBMITTED') {
      throw new Error(`Expected order status to be SUBMITTED, but got ${order.status}`);
    }
  },

  orderIsCancelled(order: { status: string }): void {
    if (order.status !== 'CANCELLED') {
      throw new Error(`Expected order status to be CANCELLED, but got ${order.status}`);
    }
  },

  orderIsFilled(order: { status: string }): void {
    if (order.status !== 'FILLED') {
      throw new Error(`Expected order status to be FILLED, but got ${order.status}`);
    }
  },

  noNewOrdersSubmitted(mockClient: { getSubmitOrderCount: () => number }, expectedCount: number = 0): void {
    const count = mockClient.getSubmitOrderCount();
    if (count !== expectedCount) {
      throw new Error(`Expected ${expectedCount} orders submitted, but got ${count}`);
    }
  },

  orderSubmitted(mockClient: { getSubmitOrderCount: () => number }, minCount: number = 1): void {
    const count = mockClient.getSubmitOrderCount();
    if (count < minCount) {
      throw new Error(`Expected at least ${minCount} order(s) submitted, but got ${count}`);
    }
  },
};

// 로그 분석 헬퍼
export const LogAnalyzer = {
  hasLogWithMessage(logs: Array<{ message: string }>, substring: string): boolean {
    return logs.some(log => log.message.includes(substring));
  },

  countLogsByLevel(logs: Array<{ logLevel: string }>, level: string): number {
    return logs.filter(log => log.logLevel === level).length;
  },

  getErrorLogs(logs: Array<{ logLevel: string; message: string }>): Array<{ message: string }> {
    return logs.filter(log => log.logLevel === 'ERROR');
  },
};
