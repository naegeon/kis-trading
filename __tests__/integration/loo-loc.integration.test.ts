/**
 * LOO/LOC 전략 실제 코드 통합 테스트
 *
 * 실제 executeLooLocStrategy 함수를 호출하고
 * 의존성(DB, KIS API)만 Mock하여 테스트
 */

// Mock 설정 (import 전에 해야 함)
jest.mock('@/lib/db/client', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    query: {
      orders: {
        findMany: jest.fn(),
      },
    },
  },
}));

jest.mock('@/lib/push/notification', () => ({
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/logger', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/market-hours', () => ({
  isUSWeekend: jest.fn().mockReturnValue(false),
  getUSMarketStatus: jest.fn().mockReturnValue({
    currentSession: 'PRE_MARKET',
    isDST: false,
    canSubmitLOO: true,
    canSubmitLOC: false,
  }),
  canEvaluateLOC: jest.fn().mockReturnValue(false),
  getMinutesSinceRegularMarketOpen: jest.fn().mockReturnValue(-60),
}));

import { executeLooLocStrategy } from '@/lib/strategies/loo-loc';
import { db } from '@/lib/db/client';
import { log } from '@/lib/logger';
import * as marketHours from '@/lib/market-hours';
import { Strategy } from '@/types/strategy';

// Mock KIS Client - 실제 loo-loc.ts가 사용하는 메서드명과 일치시킴
const createMockKISClient = () => ({
  getOverseasStockPriceDetail: jest.fn().mockResolvedValue({
    currentPrice: 24.95,
    previousClose: 24.71,
    openingPrice: 24.80,
  }),
  getAccountHoldings: jest.fn().mockResolvedValue([
    { symbol: 'TSLT', quantity: 2, averagePrice: 22.235, currentPrice: 24.95 },
  ]),
  getOverseasUnfilledOrders: jest.fn().mockResolvedValue([]),
  submitOrder: jest.fn().mockResolvedValue({ orderId: 'MOCK_ORDER_001' }),  // 실제 메서드명
  cancelOrder: jest.fn().mockResolvedValue({ success: true }),
});

// 테스트용 전략 생성
const createTestStrategy = (overrides: Partial<Strategy> = {}): Strategy => ({
  id: 'strategy-001',
  userId: 'user-001',
  name: 'Test LOO/LOC Strategy',
  type: 'LOO_LOC',
  status: 'ACTIVE',
  symbol: 'TSLT',
  market: 'US',
  parameters: {
    looEnabled: true,
    locBuyEnabled: true,
    locSellEnabled: true,
    looQty: 1,
    locBuyQty: 1,
    locSellQty: 1,
    targetReturnRate: 5,
    exchangeCode: 'NASD',
  },
  startDate: new Date(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  lastExecutedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('LOO/LOC 전략 실제 코드 통합 테스트', () => {
  let mockKIS: ReturnType<typeof createMockKISClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKIS = createMockKISClient();

    // DB Mock 기본 설정
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]), // 기본: 오늘 주문 없음
      }),
    });

    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ id: 'order-001' }]),
      }),
    });

    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'new-order-001' }]),
      }),
    });
  });

  describe('시장 검증', () => {
    test('US 시장이 아니면 전략 종료', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const strategy = createTestStrategy({ market: 'KR' as 'US' | 'KR' });

      await executeLooLocStrategy(strategy, mockKIS as any);

      // 전략 상태가 ENDED로 업데이트되어야 함
      expect(db.update).toHaveBeenCalled();
      // 실제 코드는 console.error를 사용
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('US market')
      );

      consoleSpy.mockRestore();
    });

    test('주말에는 전략 실행 스킵', async () => {
      (marketHours.isUSWeekend as jest.Mock).mockReturnValue(true);

      const strategy = createTestStrategy();
      await executeLooLocStrategy(strategy, mockKIS as any);

      // 주문 제출이 호출되지 않아야 함
      expect(mockKIS.submitOrder).not.toHaveBeenCalled();

      // 로그에 "주말" 메시지가 있어야 함
      expect(log).toHaveBeenCalledWith(
        'INFO',
        expect.stringContaining('주말'),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('LOO 주문 중복 방지', () => {
    test('이미 SUBMITTED LOO 주문이 있으면 새 주문 생성 안함', async () => {
      // 주말이 아닌 상태로 설정
      (marketHours.isUSWeekend as jest.Mock).mockReturnValue(false);
      (marketHours.getUSMarketStatus as jest.Mock).mockReturnValue({
        currentSession: 'PRE_MARKET',
        isDST: false,
        canSubmitLOO: true,
        canSubmitLOC: false,
        isRegularMarket: false,
      });

      // 오늘 SUBMITTED LOO 주문이 있다고 설정
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            {
              id: 'existing-order-001',
              strategyId: 'strategy-001',
              orderType: 'LOO',
              side: 'BUY',
              status: 'SUBMITTED',
              kisOrderId: 'KIS_ORDER_001',
              submittedAt: new Date(),
            },
          ]),
        }),
      });

      // KIS 미체결 조회도 빈 배열 반환 (DB로만 체크)
      mockKIS.getOverseasUnfilledOrders.mockResolvedValue([]);

      const strategy = createTestStrategy();
      await executeLooLocStrategy(strategy, mockKIS as any);

      // LOO 주문이 제출되지 않아야 함
      const submitCalls = mockKIS.submitOrder.mock.calls;
      const looOrders = submitCalls.filter((call: any[]) =>
        call[0]?.orderType === 'LOO' || call[0]?.orderType === '32'
      );
      expect(looOrders.length).toBe(0);

      // "이미 체결된 LOO 주문" 또는 "스킵" 관련 로그
      expect(log).toHaveBeenCalledWith(
        'INFO',
        expect.stringMatching(/LOO.*스킵|이미/),
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );
    });

    test('SUBMITTED LOO 주문이 없으면 새 주문 생성', async () => {
      // 주말이 아닌 상태로 설정
      (marketHours.isUSWeekend as jest.Mock).mockReturnValue(false);

      // 오늘 주문 없음
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      // PRE_MARKET에서 LOO 제출 가능
      (marketHours.getUSMarketStatus as jest.Mock).mockReturnValue({
        currentSession: 'PRE_MARKET',
        isDST: false,
        canSubmitLOO: true,
        canSubmitLOC: false,
        isRegularMarket: false,
      });

      const strategy = createTestStrategy({
        parameters: {
          looEnabled: true,
          locBuyEnabled: false,
          locSellEnabled: false,
          looQty: 1,
          locBuyQty: 0,
          targetReturnRate: 5,
          exchangeCode: 'NASD',
        },
      });

      await executeLooLocStrategy(strategy, mockKIS as any);

      // LOO 주문이 제출되어야 함 (submitOrder 메서드)
      expect(mockKIS.submitOrder).toHaveBeenCalled();

      // DB에 주문 저장
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('LOC 주문 로직', () => {
    test('보유 수량 없으면 LOC 매도 주문 생성 안함', async () => {
      // 주말이 아닌 상태로 설정
      (marketHours.isUSWeekend as jest.Mock).mockReturnValue(false);

      // 보유 종목 없음
      mockKIS.getAccountHoldings.mockResolvedValue([]);

      // LOC 제출 가능 시간
      (marketHours.getUSMarketStatus as jest.Mock).mockReturnValue({
        currentSession: 'REGULAR',
        isDST: false,
        canSubmitLOO: false,
        canSubmitLOC: true,
        isRegularMarket: true,
      });
      (marketHours.canEvaluateLOC as jest.Mock).mockReturnValue(true);

      const strategy = createTestStrategy({
        parameters: {
          looEnabled: false,
          looQty: 0,
          locBuyEnabled: false,
          locBuyQty: 0,
          locSellEnabled: true,
          locSellQty: 1,
          targetReturnRate: 5,
          exchangeCode: 'NASD',
        },
      });

      await executeLooLocStrategy(strategy, mockKIS as any);

      // LOC 매도 주문이 제출되지 않아야 함
      const submitCalls = mockKIS.submitOrder.mock.calls;
      const locSellOrders = submitCalls.filter((call: any[]) =>
        (call[0]?.orderType === 'LOC' || call[0]?.orderType === '34') &&
        call[0]?.side === 'SELL'
      );
      expect(locSellOrders.length).toBe(0);
    });

    test('현재 수익률과 무관하게 LOC 매도 주문이 항상 제출되어야 함', async () => {
      // LOC 매도는 조건 없이 항상 제출됨 (종가에서 체결 여부 결정)
      // 주말이 아닌 상태로 설정
      (marketHours.isUSWeekend as jest.Mock).mockReturnValue(false);

      // 보유: 평단가 24.00, 현재가 24.50 → 수익률 약 2% (목표 5% 미달)
      // 하지만 LOC 주문은 종가에서 목표가 달성 시 체결되므로 항상 제출함
      mockKIS.getAccountHoldings.mockResolvedValue([
        { symbol: 'TSLT', quantity: 2, averagePrice: 24.00, currentPrice: 24.50 },
      ]);

      mockKIS.getOverseasStockPriceDetail.mockResolvedValue({
        currentPrice: 24.50,
        previousClose: 24.00,
        openingPrice: 24.20,
      });

      (marketHours.getUSMarketStatus as jest.Mock).mockReturnValue({
        currentSession: 'REGULAR',
        isDST: false,
        canSubmitLOO: false,
        canSubmitLOC: true,
        isRegularMarket: true,
      });
      (marketHours.canEvaluateLOC as jest.Mock).mockReturnValue(true);

      const strategy = createTestStrategy({
        parameters: {
          looEnabled: false,
          looQty: 0,
          locBuyEnabled: false,
          locBuyQty: 0,
          locSellEnabled: true,
          locSellQty: 1,
          targetReturnRate: 5, // 목표 5%
          exchangeCode: 'NASD',
        },
      });

      await executeLooLocStrategy(strategy, mockKIS as any);

      // LOC 매도는 항상 제출됨 (종가에서 체결 여부 결정)
      const submitCalls = mockKIS.submitOrder.mock.calls;
      const locSellOrders = submitCalls.filter((call: any[]) =>
        call[0]?.side === 'SELL'
      );
      expect(locSellOrders.length).toBe(1);
      // 목표가 = 24.00 * 1.05 = 25.20
      expect(locSellOrders[0][0].price).toBe(25.2);
    });
  });

  describe('전략 수정 시 주문 취소', () => {
    test('전략 수정 후 미체결 주문 취소', async () => {
      // 주말이 아닌 상태로 설정
      (marketHours.isUSWeekend as jest.Mock).mockReturnValue(false);
      (marketHours.getUSMarketStatus as jest.Mock).mockReturnValue({
        currentSession: 'PRE_MARKET',
        isDST: false,
        canSubmitLOO: true,
        canSubmitLOC: false,
        isRegularMarket: false,
      });

      const orderSubmittedAt = new Date(Date.now() - 60 * 60 * 1000); // 1시간 전
      const strategyUpdatedAt = new Date(); // 방금 수정

      // 미체결 주문 있음 (1시간 전 제출)
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            {
              id: 'old-order-001',
              strategyId: 'strategy-001',
              orderType: 'LOO',
              side: 'BUY',
              status: 'SUBMITTED',
              kisOrderId: 'OLD_KIS_ORDER',
              quantity: 1,
              submittedAt: orderSubmittedAt,
            },
          ]),
        }),
      });

      const strategy = createTestStrategy({
        updatedAt: strategyUpdatedAt,
      });

      await executeLooLocStrategy(strategy, mockKIS as any);

      // 기존 주문 취소 호출
      expect(mockKIS.cancelOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          kisOrderId: 'OLD_KIS_ORDER',
        })
      );

      // DB에서 상태 CANCELLED로 업데이트
      expect(db.update).toHaveBeenCalled();
    });
  });

});

describe('sync-order-status LOO/LOC 스킵 로직 테스트', () => {
  // sync-order-status에서 사용하는 로직을 직접 테스트

  test('PRE_MARKET에 LOO 주문 sync 스킵', () => {
    // sync-order-status의 실제 로직을 복제
    const order = {
      orderType: 'LOO' as const,
      status: 'SUBMITTED',
      kisOrderId: 'LOO_001',
    };
    const strategy = { market: 'US' as const };

    // PRE_MARKET 시간 (21:00 KST)
    const preMarketTime = new Date();
    preMarketTime.setHours(21, 0, 0, 0);

    const kstHour = preMarketTime.getHours();
    const kstMinute = preMarketTime.getMinutes();
    const isUSMarketOpen = (kstHour >= 23 && kstMinute >= 30) || (kstHour < 6);

    const shouldSkipSync = (order.orderType === 'LOO' || order.orderType === 'LOC') &&
      strategy.market === 'US' &&
      !isUSMarketOpen;

    expect(shouldSkipSync).toBe(true);
  });

  test('MARKET_OPEN에 LOO 주문 sync 실행', () => {
    const order = {
      orderType: 'LOO' as const,
      status: 'SUBMITTED',
      kisOrderId: 'LOO_001',
    };
    const strategy = { market: 'US' as const };

    // MARKET_OPEN 시간 (00:30 KST)
    const marketOpenTime = new Date();
    marketOpenTime.setHours(0, 30, 0, 0);

    const kstHour = marketOpenTime.getHours();
    const kstMinute = marketOpenTime.getMinutes();
    const isUSMarketOpen = (kstHour >= 23 && kstMinute >= 30) || (kstHour < 6);

    const shouldSkipSync = (order.orderType === 'LOO' || order.orderType === 'LOC') &&
      strategy.market === 'US' &&
      !isUSMarketOpen;

    expect(shouldSkipSync).toBe(false);
  });

  test('LIMIT 주문은 항상 sync 실행', () => {
    const order = {
      orderType: 'LIMIT' as string,  // LOO/LOC가 아닌 타입
      status: 'SUBMITTED',
      kisOrderId: 'LIMIT_001',
    };
    const strategy = { market: 'US' as const };

    // PRE_MARKET 시간에도 LIMIT은 스킵 안함
    const preMarketTime = new Date();
    preMarketTime.setHours(21, 0, 0, 0);

    const kstHour = preMarketTime.getHours();
    const kstMinute = preMarketTime.getMinutes();
    const isUSMarketOpen = (kstHour >= 23 && kstMinute >= 30) || (kstHour < 6);

    const shouldSkipSync = (order.orderType === 'LOO' || order.orderType === 'LOC') &&
      strategy.market === 'US' &&
      !isUSMarketOpen;

    expect(shouldSkipSync).toBe(false);
  });
});

describe('execute-strategies 중복 실행 방지 테스트', () => {
  // execute-strategies의 canExecuteStrategy 로직 테스트

  function canExecuteStrategy(lastExecutedAt: Date | null): boolean {
    if (!lastExecutedAt) return true;

    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const now = new Date();
    const timeSinceExecution = now.getTime() - lastExecutedAt.getTime();

    return timeSinceExecution >= TEN_MINUTES_MS;
  }

  test('lastExecutedAt이 null이면 실행 가능', () => {
    expect(canExecuteStrategy(null)).toBe(true);
  });

  test('lastExecutedAt이 10분 이내면 실행 불가', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(canExecuteStrategy(fiveMinutesAgo)).toBe(false);
  });

  test('lastExecutedAt이 10분 이상이면 실행 가능', () => {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    expect(canExecuteStrategy(fifteenMinutesAgo)).toBe(true);
  });

  test('lastExecutedAt이 정확히 10분이면 실행 가능', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    expect(canExecuteStrategy(tenMinutesAgo)).toBe(true);
  });
});
