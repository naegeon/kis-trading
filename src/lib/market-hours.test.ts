import {
  isUSDaylightSavingTime,
  isUSWeekend,
  getUSMarketStatus,
  canEvaluateLOC,
  getMinutesSinceRegularMarketOpen,
  canSubmitLooLocOrder,
} from './market-hours';

describe('미국 시장 시간 유틸리티', () => {
  describe('서머타임 판별 (isUSDaylightSavingTime)', () => {
    it('서머타임 기간(4월~10월)에는 true를 반환해야 한다', () => {
      // 2024년 4월 15일 (서머타임)
      expect(isUSDaylightSavingTime(new Date('2024-04-15T12:00:00Z'))).toBe(true);
      // 2024년 7월 4일 (서머타임)
      expect(isUSDaylightSavingTime(new Date('2024-07-04T12:00:00Z'))).toBe(true);
      // 2024년 10월 15일 (서머타임)
      expect(isUSDaylightSavingTime(new Date('2024-10-15T12:00:00Z'))).toBe(true);
    });

    it('겨울시간 기간(11월~3월)에는 false를 반환해야 한다', () => {
      // 2024년 1월 15일 (겨울시간)
      expect(isUSDaylightSavingTime(new Date('2024-01-15T12:00:00Z'))).toBe(false);
      // 2024년 2월 15일 (겨울시간)
      expect(isUSDaylightSavingTime(new Date('2024-02-15T12:00:00Z'))).toBe(false);
      // 2024년 12월 15일 (겨울시간)
      expect(isUSDaylightSavingTime(new Date('2024-12-15T12:00:00Z'))).toBe(false);
    });

    it('서머타임 시작일(3월 둘째 일요일) 경계를 정확히 처리해야 한다', () => {
      // 2024년 3월 10일 (둘째 일요일) 06:59 UTC - 아직 겨울시간
      expect(isUSDaylightSavingTime(new Date('2024-03-10T06:59:00Z'))).toBe(false);
      // 2024년 3월 10일 07:00 UTC - 서머타임 시작 (동부 02:00)
      expect(isUSDaylightSavingTime(new Date('2024-03-10T07:00:00Z'))).toBe(true);
    });

    it('서머타임 종료일(11월 첫째 일요일) 경계를 정확히 처리해야 한다', () => {
      // 2024년 11월 3일 (첫째 일요일) 05:59 UTC - 아직 서머타임
      expect(isUSDaylightSavingTime(new Date('2024-11-03T05:59:00Z'))).toBe(true);
      // 2024년 11월 3일 06:00 UTC - 겨울시간 시작 (동부 02:00)
      expect(isUSDaylightSavingTime(new Date('2024-11-03T06:00:00Z'))).toBe(false);
    });
  });

  describe('주말 판별 (isUSWeekend)', () => {
    it('토요일은 주말로 판별해야 한다', () => {
      // 2024년 12월 7일 토요일 (미국 동부 기준)
      expect(isUSWeekend(new Date('2024-12-07T12:00:00Z'))).toBe(true);
    });

    it('일요일은 주말로 판별해야 한다', () => {
      // 2024년 12월 8일 일요일 (미국 동부 기준)
      expect(isUSWeekend(new Date('2024-12-08T12:00:00Z'))).toBe(true);
    });

    it('평일은 주말이 아니어야 한다', () => {
      // 2024년 12월 5일 목요일 (미국 동부 기준)
      expect(isUSWeekend(new Date('2024-12-05T12:00:00Z'))).toBe(false);
      // 2024년 12월 6일 금요일 (미국 동부 기준)
      expect(isUSWeekend(new Date('2024-12-06T12:00:00Z'))).toBe(false);
    });

    it('시간대 경계를 정확히 처리해야 한다', () => {
      // 2024년 12월 7일 토요일 새벽 4시 UTC = 금요일 밤 11시 EST (겨울시간)
      // 아직 금요일이므로 주말 아님
      expect(isUSWeekend(new Date('2024-12-07T04:00:00Z'))).toBe(false);
      // 2024년 12월 7일 토요일 오전 5시 UTC = 토요일 0시 EST
      expect(isUSWeekend(new Date('2024-12-07T05:00:00Z'))).toBe(true);
    });
  });

  describe('시장 상태 조회 (getUSMarketStatus)', () => {
    describe('서머타임 기간', () => {
      // 서머타임: 프리마켓 17:00~22:30, 정규장 22:30~05:00, 애프터마켓 05:00~09:00 (한국시간)

      it('프리마켓 시간을 정확히 판별해야 한다', () => {
        // 2024년 7월 4일 17:30 KST = 08:30 UTC (서머타임, 프리마켓)
        const status = getUSMarketStatus(new Date('2024-07-04T08:30:00Z'));
        expect(status.isDST).toBe(true);
        expect(status.isPreMarket).toBe(true);
        expect(status.isRegularMarket).toBe(false);
        expect(status.canSubmitLOO).toBe(true);
        expect(status.currentSession).toBe('PRE_MARKET');
      });

      it('정규장 시간을 정확히 판별해야 한다', () => {
        // 2024년 7월 4일 23:00 KST = 14:00 UTC (서머타임, 정규장)
        const status = getUSMarketStatus(new Date('2024-07-04T14:00:00Z'));
        expect(status.isDST).toBe(true);
        expect(status.isRegularMarket).toBe(true);
        expect(status.canSubmitLOC).toBe(true);
        expect(status.currentSession).toBe('REGULAR');
      });

      it('정규장 (다음날 새벽)을 정확히 판별해야 한다', () => {
        // 2024년 7월 5일 03:00 KST = 2024년 7월 4일 18:00 UTC (서머타임, 정규장)
        const status = getUSMarketStatus(new Date('2024-07-04T18:00:00Z'));
        expect(status.isDST).toBe(true);
        expect(status.isRegularMarket).toBe(true);
        expect(status.currentSession).toBe('REGULAR');
      });

      it('애프터마켓 시간을 정확히 판별해야 한다', () => {
        // 2024년 7월 5일 07:00 KST = 2024년 7월 4일 22:00 UTC (서머타임, 애프터마켓)
        const status = getUSMarketStatus(new Date('2024-07-04T22:00:00Z'));
        expect(status.isDST).toBe(true);
        expect(status.isAfterMarket).toBe(true);
        expect(status.currentSession).toBe('AFTER_MARKET');
      });

      it('시장 마감 시간을 정확히 판별해야 한다', () => {
        // 2024년 7월 5일 10:00 KST = 2024년 7월 5일 01:00 UTC (서머타임, 마감)
        const status = getUSMarketStatus(new Date('2024-07-05T01:00:00Z'));
        expect(status.isDST).toBe(true);
        expect(status.isMarketOpen).toBe(false);
        expect(status.currentSession).toBe('CLOSED');
      });
    });

    describe('겨울시간 기간', () => {
      // 겨울시간: 프리마켓 18:00~23:30, 정규장 23:30~06:00, 애프터마켓 06:00~10:00 (한국시간)

      it('프리마켓 시간을 정확히 판별해야 한다', () => {
        // 2024년 12월 5일 19:00 KST = 10:00 UTC (겨울시간, 프리마켓)
        const status = getUSMarketStatus(new Date('2024-12-05T10:00:00Z'));
        expect(status.isDST).toBe(false);
        expect(status.isPreMarket).toBe(true);
        expect(status.canSubmitLOO).toBe(true);
        expect(status.currentSession).toBe('PRE_MARKET');
      });

      it('정규장 시간을 정확히 판별해야 한다', () => {
        // 2024년 12월 6일 00:00 KST = 2024년 12월 5일 15:00 UTC (겨울시간, 정규장)
        const status = getUSMarketStatus(new Date('2024-12-05T15:00:00Z'));
        expect(status.isDST).toBe(false);
        expect(status.isRegularMarket).toBe(true);
        expect(status.canSubmitLOC).toBe(true);
        expect(status.currentSession).toBe('REGULAR');
      });

      it('애프터마켓 시간을 정확히 판별해야 한다', () => {
        // 2024년 12월 6일 08:00 KST = 2024년 12월 5일 23:00 UTC (겨울시간, 애프터마켓)
        const status = getUSMarketStatus(new Date('2024-12-05T23:00:00Z'));
        expect(status.isDST).toBe(false);
        expect(status.isAfterMarket).toBe(true);
        expect(status.currentSession).toBe('AFTER_MARKET');
      });
    });
  });

  describe('LOC 평가 가능 여부 (canEvaluateLOC)', () => {
    it('정규장 시작 후 10분 경과 시 true를 반환해야 한다', () => {
      // 겨울시간: 정규장 시작 23:30 KST
      // 2024년 12월 6일 23:40 KST = 2024년 12월 6일 14:40 UTC
      expect(canEvaluateLOC(new Date('2024-12-06T14:40:00Z'))).toBe(true);
    });

    it('정규장 시작 후 10분 미만이면 false를 반환해야 한다', () => {
      // 겨울시간: 정규장 시작 23:30 KST
      // 2024년 12월 6일 23:35 KST = 2024년 12월 6일 14:35 UTC (5분 경과)
      expect(canEvaluateLOC(new Date('2024-12-06T14:35:00Z'))).toBe(false);
    });

    it('정규장이 아닌 시간에는 false를 반환해야 한다', () => {
      // 프리마켓 시간
      expect(canEvaluateLOC(new Date('2024-12-05T10:00:00Z'))).toBe(false);
      // 시장 마감 시간
      expect(canEvaluateLOC(new Date('2024-12-05T02:00:00Z'))).toBe(false);
    });
  });

  describe('정규장 시작 후 경과 시간 (getMinutesSinceRegularMarketOpen)', () => {
    it('정규장 시작 직후 0분을 반환해야 한다', () => {
      // 겨울시간: 정규장 시작 23:30 KST = 14:30 UTC
      expect(getMinutesSinceRegularMarketOpen(new Date('2024-12-05T14:30:00Z'))).toBe(0);
    });

    it('정규장 시작 후 30분 경과 시 30을 반환해야 한다', () => {
      // 겨울시간: 24:00 KST = 15:00 UTC (30분 경과)
      expect(getMinutesSinceRegularMarketOpen(new Date('2024-12-05T15:00:00Z'))).toBe(30);
    });

    it('자정 이후 정규장 시간도 정확히 계산해야 한다', () => {
      // 겨울시간: 정규장 시작 23:30 KST, 현재 02:00 KST (다음날)
      // 02:00 KST = 17:00 UTC (전날)
      // 23:30 ~ 02:00 = 150분 (2시간 30분)
      expect(getMinutesSinceRegularMarketOpen(new Date('2024-12-05T17:00:00Z'))).toBe(150);
    });

    it('정규장 종료 후에는 999를 반환해야 한다', () => {
      // 겨울시간: 정규장 종료 06:00 KST 이후, 프리마켓 시작 18:00 KST 전
      // 12:00 KST = 03:00 UTC
      expect(getMinutesSinceRegularMarketOpen(new Date('2024-12-05T03:00:00Z'))).toBe(999);
    });
  });

  describe('LOO/LOC 주문 가능 여부 (canSubmitLooLocOrder)', () => {
    it('프리마켓에서 LOO 주문이 가능해야 한다', () => {
      // 2024년 12월 5일 19:00 KST = 10:00 UTC (겨울시간, 프리마켓)
      const result = canSubmitLooLocOrder('LOO', new Date('2024-12-05T10:00:00Z'));
      expect(result.canSubmit).toBe(true);
      expect(result.reason).toContain('프리마켓');
    });

    it('정규장에서 LOO 주문이 불가능해야 한다', () => {
      // 2024년 12월 6일 00:00 KST = 15:00 UTC (겨울시간, 정규장)
      const result = canSubmitLooLocOrder('LOO', new Date('2024-12-05T15:00:00Z'));
      expect(result.canSubmit).toBe(false);
      expect(result.reason).toContain('프리마켓');
    });

    it('정규장에서 LOC 주문이 가능해야 한다', () => {
      // 2024년 12월 6일 00:00 KST = 15:00 UTC (겨울시간, 정규장)
      const result = canSubmitLooLocOrder('LOC', new Date('2024-12-05T15:00:00Z'));
      expect(result.canSubmit).toBe(true);
      expect(result.reason).toContain('정규장');
    });

    it('프리마켓에서 LOC 주문이 불가능해야 한다', () => {
      // 2024년 12월 5일 19:00 KST = 10:00 UTC (겨울시간, 프리마켓)
      const result = canSubmitLooLocOrder('LOC', new Date('2024-12-05T10:00:00Z'));
      expect(result.canSubmit).toBe(false);
      expect(result.reason).toContain('정규장');
    });

    it('주말에는 LOO/LOC 주문이 모두 불가능해야 한다', () => {
      // 2024년 12월 7일 토요일
      const looResult = canSubmitLooLocOrder('LOO', new Date('2024-12-07T10:00:00Z'));
      const locResult = canSubmitLooLocOrder('LOC', new Date('2024-12-07T15:00:00Z'));
      expect(looResult.canSubmit).toBe(false);
      expect(looResult.reason).toContain('주말');
      expect(locResult.canSubmit).toBe(false);
      expect(locResult.reason).toContain('주말');
    });
  });
});
