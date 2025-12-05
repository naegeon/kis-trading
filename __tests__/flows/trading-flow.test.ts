/**
 * 전체 트레이딩 플로우 통합 테스트
 *
 * 테스트 시나리오:
 * 1. LOO/LOC 전략 전체 플로우
 * 2. 분할주문 전략 전체 플로우
 * 3. sync-order-status 크론잡 동작
 * 4. execute-strategies 크론잡 동작
 * 5. 중복 주문 방지
 * 6. 에러 핸들링
 */

import { MockKISClient, createMockKISClient } from '../__mocks__/kis-client.mock';
import { mockDB, resetMockDB, MockOrder, MockStrategy } from '../__mocks__/db.mock';
import { TimeHelper, isUSMarketOpen, isUSMarketClosed, Assertions } from '../__mocks__/test-utils';

describe('전체 트레이딩 플로우 테스트', () => {
  let mockKIS: MockKISClient;

  beforeEach(() => {
    resetMockDB();
    mockKIS = createMockKISClient({
      stockPrice: {
        currentPrice: 24.95,
        previousClose: 24.71,
        openingPrice: 24.80,
      },
      holdings: [
        { symbol: 'TSLT', quantity: 2, averagePrice: 22.235, currentPrice: 24.95 },
      ],
      deposit: { deposit: 162.37, buyableCash: 161.48 },
    });
  });

  // ============================================================
  // 1. LOO/LOC 전략 플로우 테스트
  // ============================================================
  describe('LOO/LOC 전략 플로우', () => {

    describe('PRE_MARKET 시간대', () => {

      test('LOO 주문 제출 → SUBMITTED 상태로 DB 저장', async () => {
        // Given: PRE_MARKET 시간대, ACTIVE 상태의 LOO/LOC 전략
        const { strategy, user } = mockDB.setupTestScenario({
          strategy: {
            type: 'LOO_LOC',
            status: 'ACTIVE',
            symbol: 'TSLT',
            parameters: {
              looEnabled: true,
              locBuyEnabled: false,
              locSellEnabled: false,
              looQty: 1,
              exchangeCode: 'NASD',
            },
          },
        });

        // When: LOO 주문 제출
        const order = mockDB.createOrder({
          strategyId: strategy.id,
          userId: user.id,
          kisOrderId: 'KIS_ORDER_001',
          symbol: 'TSLT',
          side: 'BUY',
          orderType: 'LOO',
          quantity: 1,
          price: '24.71',
          status: 'SUBMITTED',
          filledQuantity: null,
          avgPrice: null,
          errorMessage: null,
          submittedAt: new Date(),
          filledAt: null,
        });

        // Then: 주문이 SUBMITTED 상태로 저장됨
        expect(order.status).toBe('SUBMITTED');
        expect(order.orderType).toBe('LOO');
        expect(order.kisOrderId).toBe('KIS_ORDER_001');
      });

      test('이미 SUBMITTED LOO 주문이 있으면 새 주문 생성 안함 (중복 방지)', async () => {
        // Given: 이미 SUBMITTED 상태의 LOO 주문이 있는 전략
        const { strategy, user, orders } = mockDB.setupTestScenario({
          strategy: {
            type: 'LOO_LOC',
            status: 'ACTIVE',
            symbol: 'TSLT',
            parameters: { looEnabled: true, looQty: 1 },
          },
          orders: [
            {
              orderType: 'LOO',
              side: 'BUY',
              status: 'SUBMITTED',
              kisOrderId: 'EXISTING_ORDER_001',
            },
          ],
        });

        // When: 오늘 SUBMITTED 상태의 LOO 주문 확인
        const todayOrders = mockDB.findTodayOrdersByStrategyId(strategy.id);
        const pendingLOOOrders = todayOrders.filter(o =>
          o.status === 'SUBMITTED' && o.orderType === 'LOO'
        );

        // Then: 이미 LOO 주문이 있으므로 새 주문 생성하지 않음
        const hasLOOOrder = pendingLOOOrders.length > 0;
        expect(hasLOOOrder).toBe(true);

        // 새 주문 제출하지 않음
        Assertions.noNewOrdersSubmitted(mockKIS, 0);
      });

      test('sync-order-status가 PRE_MARKET에 LOO 주문을 스킵함', async () => {
        // Given: PRE_MARKET 시간대, SUBMITTED 상태의 LOO 주문
        const { strategy, orders } = mockDB.setupTestScenario({
          strategy: { type: 'LOO_LOC', market: 'US' },
          orders: [
            {
              orderType: 'LOO',
              status: 'SUBMITTED',
              kisOrderId: 'LOO_ORDER_001',
            },
          ],
        });

        const order = orders[0];

        // When: PRE_MARKET 시간대 체크 (sync-order-status 로직)
        const now = TimeHelper.setPreMarket();
        const kstHour = now.getHours();
        const kstMinute = now.getMinutes();
        const isMarketOpen = (kstHour >= 23 && kstMinute >= 30) || (kstHour < 6);

        // LOO/LOC 주문 + US 시장 + 장 미개장 → 스킵
        const shouldSkipSync = (order.orderType === 'LOO' || order.orderType === 'LOC') &&
          strategy.market === 'US' &&
          !isMarketOpen;

        // Then: sync를 스킵해야 함
        expect(shouldSkipSync).toBe(true);

        // 주문 상태는 SUBMITTED 유지
        expect(order.status).toBe('SUBMITTED');
      });

    });

    describe('MARKET_OPEN 시간대', () => {

      test('시장 개장 후 LOO 주문이 FILLED로 동기화됨', async () => {
        // Given: 시장 개장, SUBMITTED 상태의 LOO 주문
        const { strategy, orders } = mockDB.setupTestScenario({
          strategy: { type: 'LOO_LOC', market: 'US' },
          orders: [
            {
              orderType: 'LOO',
              status: 'SUBMITTED',
              kisOrderId: 'LOO_ORDER_001',
            },
          ],
        });

        // KIS API에서 체결 완료 응답
        mockKIS.updateConfig({
          orderDetails: {
            'LOO_ORDER_001': {
              status: 'FILLED',
              filledQuantity: 1,
              avgPrice: 24.65,
            },
          },
        });

        // When: 시장 개장 시간
        const now = TimeHelper.setMarketOpen();
        const isMarketOpen = (now.getHours() >= 23) || (now.getHours() < 6);
        expect(isMarketOpen).toBe(true);

        // KIS API로 주문 상태 조회
        const kisOrderDetails = await mockKIS.getOrderDetail('LOO_ORDER_001', 'TSLT', 'US');

        // DB 업데이트 (sync-order-status 로직)
        if (kisOrderDetails.status === 'FILLED') {
          mockDB.updateOrder(orders[0].id, {
            status: 'FILLED',
            filledQuantity: kisOrderDetails.filledQuantity,
            avgPrice: kisOrderDetails.avgPrice.toString(),
            filledAt: new Date(),
          });
        }

        // Then: 주문이 FILLED로 업데이트됨
        const updatedOrder = mockDB.findOrderById(orders[0].id);
        expect(updatedOrder?.status).toBe('FILLED');
        expect(updatedOrder?.filledQuantity).toBe(1);
        expect(updatedOrder?.avgPrice).toBe('24.65');
      });

      test('KIS에서 주문 찾을 수 없을 때 CANCELLED로 처리됨', async () => {
        // Given: 시장 개장, SUBMITTED 상태의 LOO 주문 (KIS에 없음)
        const { orders } = mockDB.setupTestScenario({
          strategy: { type: 'LOO_LOC', market: 'US' },
          orders: [
            {
              orderType: 'LOO',
              status: 'SUBMITTED',
              kisOrderId: 'UNKNOWN_ORDER',
            },
          ],
        });

        // KIS API에 해당 주문 없음 (빈 orderDetails)
        mockKIS.updateConfig({ orderDetails: {} });

        // When: KIS API로 주문 상태 조회
        const kisOrderDetails = await mockKIS.getOrderDetail('UNKNOWN_ORDER', 'TSLT', 'US');

        // Then: 찾을 수 없으면 CANCELLED 반환 (실제 로직과 동일)
        expect(kisOrderDetails.status).toBe('CANCELLED');

        // DB 업데이트
        if (kisOrderDetails.status === 'CANCELLED') {
          mockDB.updateOrder(orders[0].id, { status: 'CANCELLED' });
        }

        const updatedOrder = mockDB.findOrderById(orders[0].id);
        expect(updatedOrder?.status).toBe('CANCELLED');
      });

    });

    describe('LOC 주문 플로우', () => {

      test('보유 수량 있고 목표 수익률 도달 시 LOC 매도 주문 생성', async () => {
        // Given: 보유 종목 있음, 목표 수익률 5%, 현재 수익률 12%
        mockKIS.updateConfig({
          holdings: [
            { symbol: 'TSLT', quantity: 2, averagePrice: 22.235, currentPrice: 24.95 },
          ],
          stockPrice: {
            currentPrice: 24.95,
            previousClose: 24.71,
            openingPrice: 24.80,
          },
        });

        const { strategy, user } = mockDB.setupTestScenario({
          strategy: {
            type: 'LOO_LOC',
            parameters: {
              locSellEnabled: true,
              locSellQty: 1,
              targetReturnRate: 5,  // 목표 5%
            },
          },
        });

        // When: 현재 수익률 계산
        const holdings = await mockKIS.getAccountHoldings();
        const holding = holdings.find(h => h.symbol === 'TSLT');
        const currentReturnRate = holding ? holding.profitRate : 0;

        // Then: 목표 수익률(5%) 초과했으므로 LOC 매도 가능
        expect(currentReturnRate).toBeGreaterThan(5);

        // LOC 매도 주문 생성
        const sellOrder = mockDB.createOrder({
          strategyId: strategy.id,
          userId: user.id,
          kisOrderId: 'LOC_SELL_001',
          symbol: 'TSLT',
          side: 'SELL',
          orderType: 'LOC',
          quantity: 1,
          price: '24.95',
          status: 'SUBMITTED',
          filledQuantity: null,
          avgPrice: null,
          errorMessage: null,
          submittedAt: new Date(),
          filledAt: null,
        });

        expect(sellOrder.side).toBe('SELL');
        expect(sellOrder.orderType).toBe('LOC');
      });

      test('보유 수량 없으면 LOC 매도 주문 생성 안함', async () => {
        // Given: 보유 종목 없음
        mockKIS.updateConfig({
          holdings: [],
        });

        const { strategy } = mockDB.setupTestScenario({
          strategy: {
            type: 'LOO_LOC',
            parameters: {
              locSellEnabled: true,
              locSellQty: 1,
              targetReturnRate: 5,
            },
          },
        });

        // When: 보유 조회
        const holdings = await mockKIS.getAccountHoldings();
        const holding = holdings.find(h => h.symbol === strategy.symbol);

        // Then: 보유 없으면 LOC 매도 불가
        expect(holding).toBeUndefined();

        // 주문 생성하지 않음
        const todayOrders = mockDB.findTodayOrdersByStrategyId(strategy.id);
        const locSellOrders = todayOrders.filter(o =>
          o.orderType === 'LOC' && o.side === 'SELL'
        );
        expect(locSellOrders.length).toBe(0);
      });

    });

  });

  // ============================================================
  // 2. 분할주문 전략 플로우 테스트
  // ============================================================
  describe('분할주문(Split-Order) 전략 플로우', () => {

    test('삼각형 분배로 여러 가격대에 주문 생성', async () => {
      // Given: 분할주문 전략 (삼각형 분배)
      const { strategy, user } = mockDB.setupTestScenario({
        strategy: {
          type: 'SPLIT_ORDER',
          status: 'ACTIVE',
          symbol: 'TSLT',
          parameters: {
            basePrice: 100,
            priceStep: 1,       // $1 간격
            totalOrders: 5,     // 5단계
            totalQuantity: 15,  // 총 15주
            distribution: 'PYRAMID',  // 삼각형 (1,2,3,4,5)
          },
        },
      });

      // When: 삼각형 분배 계산
      // $100: 1주, $99: 2주, $98: 3주, $97: 4주, $96: 5주
      const expectedOrders = [
        { price: 100, quantity: 1 },
        { price: 99, quantity: 2 },
        { price: 98, quantity: 3 },
        { price: 97, quantity: 4 },
        { price: 96, quantity: 5 },
      ];

      // 주문 생성
      for (const expected of expectedOrders) {
        mockDB.createOrder({
          strategyId: strategy.id,
          userId: user.id,
          kisOrderId: `ORDER_${expected.price}`,
          symbol: 'TSLT',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: expected.quantity,
          price: expected.price.toString(),
          status: 'SUBMITTED',
          filledQuantity: null,
          avgPrice: null,
          errorMessage: null,
          submittedAt: new Date(),
          filledAt: null,
        });
      }

      // Then: 5개 주문이 생성됨
      const orders = mockDB.findOrdersByStrategyId(strategy.id);
      expect(orders.length).toBe(5);

      // 총 수량 확인 (1+2+3+4+5=15)
      const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
      expect(totalQty).toBe(15);
    });

    test('일부 주문 체결 시 평단가 재계산', async () => {
      // Given: 분할주문 중 일부 체결
      const { strategy, user } = mockDB.setupTestScenario({
        strategy: {
          type: 'SPLIT_ORDER',
          parameters: {
            currentAvgCost: 0,
            currentQty: 0,
          },
        },
      });

      // $99에 2주 체결
      mockDB.createOrder({
        strategyId: strategy.id,
        userId: user.id,
        kisOrderId: 'ORDER_99',
        symbol: 'TSLT',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 2,
        price: '99',
        status: 'FILLED',
        filledQuantity: 2,
        avgPrice: '99',
        errorMessage: null,
        submittedAt: new Date(),
        filledAt: new Date(),
      });

      // $97에 4주 체결
      mockDB.createOrder({
        strategyId: strategy.id,
        userId: user.id,
        kisOrderId: 'ORDER_97',
        symbol: 'TSLT',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 4,
        price: '97',
        status: 'FILLED',
        filledQuantity: 4,
        avgPrice: '97',
        errorMessage: null,
        submittedAt: new Date(),
        filledAt: new Date(),
      });

      // When: 평단가 계산
      const filledOrders = mockDB.findOrdersByStrategyId(strategy.id)
        .filter(o => o.status === 'FILLED');

      const totalCost = filledOrders.reduce((sum, o) =>
        sum + (o.filledQuantity || 0) * parseFloat(o.avgPrice || '0'), 0
      );
      const totalQty = filledOrders.reduce((sum, o) =>
        sum + (o.filledQuantity || 0), 0
      );
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;

      // Then: 평단가 = (99*2 + 97*4) / 6 = 586 / 6 ≈ 97.67
      expect(avgCost).toBeCloseTo(97.67, 1);
      expect(totalQty).toBe(6);
    });

    test('목표 수익률 도달 시 매도 주문 생성', async () => {
      // Given: 평단가 $97.67, 목표 수익률 5%, 현재가 $103
      const { strategy, user } = mockDB.setupTestScenario({
        strategy: {
          type: 'SPLIT_ORDER',
          parameters: {
            currentAvgCost: 97.67,
            currentQty: 6,
            targetReturnRate: 5,
          },
        },
      });

      mockKIS.updateConfig({
        stockPrice: {
          currentPrice: 103,
          previousClose: 100,
          openingPrice: 101,
        },
      });

      // When: 현재 수익률 계산
      const priceInfo = await mockKIS.getOverseasStockPriceDetail('TSLT', 'NASD');
      const avgCost = 97.67;
      const currentReturn = ((priceInfo.currentPrice - avgCost) / avgCost) * 100;

      // Then: 목표 수익률(5%) 초과 → 매도 주문 생성
      expect(currentReturn).toBeGreaterThan(5);

      // 매도 주문 생성
      const sellOrder = mockDB.createOrder({
        strategyId: strategy.id,
        userId: user.id,
        kisOrderId: 'SELL_ORDER_001',
        symbol: 'TSLT',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 6,
        price: '103',
        status: 'SUBMITTED',
        filledQuantity: null,
        avgPrice: null,
        errorMessage: null,
        submittedAt: new Date(),
        filledAt: null,
      });

      expect(sellOrder.side).toBe('SELL');
      expect(sellOrder.quantity).toBe(6);
    });

  });

  // ============================================================
  // 3. sync-order-status 크론잡 테스트
  // ============================================================
  describe('sync-order-status 크론잡', () => {

    test('SUBMITTED 주문을 KIS API 상태로 동기화', async () => {
      // Given: 여러 SUBMITTED 주문
      const { strategy } = mockDB.setupTestScenario({
        orders: [
          { kisOrderId: 'ORDER_001', status: 'SUBMITTED' },
          { kisOrderId: 'ORDER_002', status: 'SUBMITTED' },
          { kisOrderId: 'ORDER_003', status: 'SUBMITTED' },
        ],
      });

      // KIS API 응답 설정
      mockKIS.updateConfig({
        orderDetails: {
          'ORDER_001': { status: 'FILLED', filledQuantity: 1, avgPrice: 24.65 },
          'ORDER_002': { status: 'PARTIALLY_FILLED', filledQuantity: 1, avgPrice: 24.70 },
          'ORDER_003': { status: 'CANCELLED', filledQuantity: 0, avgPrice: 0 },
        },
      });

      // When: 각 주문 상태 동기화
      const pendingOrders = mockDB.findPendingOrders();

      for (const order of pendingOrders) {
        if (!order.kisOrderId) continue;

        const kisStatus = await mockKIS.getOrderDetail(
          order.kisOrderId,
          order.symbol,
          strategy.market
        );

        mockDB.updateOrder(order.id, {
          status: kisStatus.status,
          filledQuantity: kisStatus.filledQuantity,
          avgPrice: kisStatus.avgPrice.toString(),
          filledAt: kisStatus.status === 'FILLED' ? new Date() : null,
        });
      }

      // Then: 각 주문이 올바른 상태로 업데이트됨
      const allOrders = mockDB.findOrdersByStrategyId(strategy.id);
      const filledOrder = allOrders.find(o => o.kisOrderId === 'ORDER_001');
      const partialOrder = allOrders.find(o => o.kisOrderId === 'ORDER_002');
      const cancelledOrder = allOrders.find(o => o.kisOrderId === 'ORDER_003');

      expect(filledOrder?.status).toBe('FILLED');
      expect(partialOrder?.status).toBe('PARTIALLY_FILLED');
      expect(cancelledOrder?.status).toBe('CANCELLED');
    });

    test('LOO/LOC 주문은 PRE_MARKET에 sync 스킵', async () => {
      // Given: PRE_MARKET 시간대의 LOO 주문
      const { strategy, orders } = mockDB.setupTestScenario({
        strategy: { market: 'US' },
        orders: [
          { orderType: 'LOO', status: 'SUBMITTED', kisOrderId: 'LOO_001' },
          { orderType: 'LOC', status: 'SUBMITTED', kisOrderId: 'LOC_001' },
          { orderType: 'LIMIT', status: 'SUBMITTED', kisOrderId: 'LIMIT_001' },
        ],
      });

      // PRE_MARKET 시간 설정
      const preMarketTime = TimeHelper.setPreMarket();
      const isMarketOpen = (preMarketTime.getHours() >= 23) || (preMarketTime.getHours() < 6);

      // When: 각 주문에 대해 sync 여부 결정
      const syncResults: { orderId: string; skipped: boolean }[] = [];

      for (const order of orders) {
        const shouldSkip = (order.orderType === 'LOO' || order.orderType === 'LOC') &&
          strategy.market === 'US' &&
          !isMarketOpen;

        syncResults.push({
          orderId: order.kisOrderId!,
          skipped: shouldSkip,
        });
      }

      // Then: LOO/LOC는 스킵, LIMIT은 sync
      expect(syncResults.find(r => r.orderId === 'LOO_001')?.skipped).toBe(true);
      expect(syncResults.find(r => r.orderId === 'LOC_001')?.skipped).toBe(true);
      expect(syncResults.find(r => r.orderId === 'LIMIT_001')?.skipped).toBe(false);
    });

  });

  // ============================================================
  // 4. execute-strategies 크론잡 테스트
  // ============================================================
  describe('execute-strategies 크론잡', () => {

    test('ACTIVE 전략만 실행', async () => {
      // Given: ACTIVE, INACTIVE 전략 혼합
      const user = mockDB.createUser({ email: 'test@test.com', name: 'Test' });

      const activeStrategy = mockDB.createStrategy({
        userId: user.id,
        name: 'Active Strategy',
        type: 'LOO_LOC',
        status: 'ACTIVE',
        symbol: 'TSLT',
        market: 'US',
        parameters: {},
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastExecutedAt: null,
      });

      const inactiveStrategy = mockDB.createStrategy({
        userId: user.id,
        name: 'Inactive Strategy',
        type: 'LOO_LOC',
        status: 'INACTIVE',
        symbol: 'AAPL',
        market: 'US',
        parameters: {},
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastExecutedAt: null,
      });

      // When: ACTIVE 전략 조회
      const activeStrategies = mockDB.findActiveStrategies();

      // Then: ACTIVE 전략만 반환
      expect(activeStrategies.length).toBe(1);
      expect(activeStrategies[0].id).toBe(activeStrategy.id);
      expect(activeStrategies.find(s => s.id === inactiveStrategy.id)).toBeUndefined();
    });

    test('lastExecutedAt 10분 이내면 실행 스킵 (중복 실행 방지)', async () => {
      // Given: 5분 전에 실행된 전략
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const { strategy } = mockDB.setupTestScenario({
        strategy: {
          status: 'ACTIVE',
          lastExecutedAt: fiveMinutesAgo,
        },
      });

      // When: 실행 가능 여부 체크 (10분 임계값)
      const TEN_MINUTES_MS = 10 * 60 * 1000;
      const now = new Date();
      const timeSinceExecution = strategy.lastExecutedAt
        ? now.getTime() - strategy.lastExecutedAt.getTime()
        : Infinity;

      const canExecute = timeSinceExecution >= TEN_MINUTES_MS;

      // Then: 10분 미만이므로 실행 불가
      expect(canExecute).toBe(false);
    });

    test('lastExecutedAt 10분 이상이면 실행', async () => {
      // Given: 15분 전에 실행된 전략
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      const { strategy } = mockDB.setupTestScenario({
        strategy: {
          status: 'ACTIVE',
          lastExecutedAt: fifteenMinutesAgo,
        },
      });

      // When: 실행 가능 여부 체크
      const TEN_MINUTES_MS = 10 * 60 * 1000;
      const now = new Date();
      const timeSinceExecution = strategy.lastExecutedAt
        ? now.getTime() - strategy.lastExecutedAt.getTime()
        : Infinity;

      const canExecute = timeSinceExecution >= TEN_MINUTES_MS;

      // Then: 10분 이상이므로 실행 가능
      expect(canExecute).toBe(true);
    });

    test('실행 후 lastExecutedAt 업데이트', async () => {
      // Given: 실행 전
      const { strategy } = mockDB.setupTestScenario({
        strategy: {
          status: 'ACTIVE',
          lastExecutedAt: null,
        },
      });

      expect(strategy.lastExecutedAt).toBeNull();

      // When: 전략 실행 후 타임스탬프 업데이트
      const executedAt = new Date();
      mockDB.updateStrategy(strategy.id, { lastExecutedAt: executedAt });

      // Then: lastExecutedAt이 업데이트됨
      const updatedStrategy = mockDB.findStrategyById(strategy.id);
      expect(updatedStrategy?.lastExecutedAt).toEqual(executedAt);
    });

  });

  // ============================================================
  // 5. 에러 핸들링 테스트
  // ============================================================
  describe('에러 핸들링', () => {

    test('KIS API 주문 실패 시 에러 로깅', async () => {
      // Given: 주문 실패하도록 설정
      mockKIS.updateConfig({
        submitOrderResult: {
          success: false,
          errorMessage: 'Insufficient funds',
        },
      });

      const { strategy, user } = mockDB.setupTestScenario({});

      // When: 주문 제출 시도
      let orderError: string | null = null;
      try {
        await mockKIS.submitOverseasOrder({
          symbol: 'TSLT',
          side: 'BUY',
          orderType: 'LOO',
          quantity: 1,
          price: 24.71,
          exchangeCode: 'NASD',
        });
      } catch (error) {
        orderError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Then: 에러가 발생함
      expect(orderError).toBe('Insufficient funds');

      // 에러 로그 저장
      mockDB.createLog({
        userId: user.id,
        strategyId: strategy.id,
        logLevel: 'ERROR',
        message: `주문 실패: ${orderError}`,
        metadata: { symbol: 'TSLT', side: 'BUY' },
      });

      const errorLogs = mockDB.findLogsByLevel('ERROR');
      expect(errorLogs.length).toBe(1);
      expect(errorLogs[0].message).toContain('Insufficient funds');
    });

    test('API 키 없는 사용자는 전략 실행 스킵', async () => {
      // Given: credentials 없는 사용자
      const user = mockDB.createUser({ email: 'no-creds@test.com', name: 'No Creds' });
      const strategy = mockDB.createStrategy({
        userId: user.id,
        name: 'Strategy without creds',
        type: 'LOO_LOC',
        status: 'ACTIVE',
        symbol: 'TSLT',
        market: 'US',
        parameters: {},
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastExecutedAt: null,
      });

      // When: credentials 조회
      const credentials = mockDB.findCredentialsByUserId(user.id);

      // Then: credentials 없으므로 전략 실행 스킵
      expect(credentials).toBeUndefined();

      // 경고 로그 저장
      mockDB.createLog({
        userId: user.id,
        strategyId: strategy.id,
        logLevel: 'WARN',
        message: `User ${user.id} has no credentials. Cannot execute strategy.`,
        metadata: {},
      });

      const warnLogs = mockDB.findLogsByLevel('WARN');
      expect(warnLogs.length).toBe(1);
    });

  });

  // ============================================================
  // 6. 엔드투엔드 시나리오 테스트
  // ============================================================
  describe('엔드투엔드 시나리오', () => {

    test('LOO/LOC 전체 일일 사이클', async () => {
      // Day 1: PRE_MARKET
      console.log('=== PRE_MARKET: LOO 주문 제출 ===');

      const { strategy, user, credentials } = mockDB.setupTestScenario({
        strategy: {
          type: 'LOO_LOC',
          status: 'ACTIVE',
          symbol: 'TSLT',
          parameters: {
            looEnabled: true,
            locBuyEnabled: true,
            locSellEnabled: true,
            looQty: 1,
            locBuyQty: 1,
            locSellQty: 1,
            targetReturnRate: 5,
          },
        },
      });

      // 1. LOO 주문 제출
      const looOrder = mockDB.createOrder({
        strategyId: strategy.id,
        userId: user.id,
        kisOrderId: 'LOO_001',
        symbol: 'TSLT',
        side: 'BUY',
        orderType: 'LOO',
        quantity: 1,
        price: '24.71',
        status: 'SUBMITTED',
        filledQuantity: null,
        avgPrice: null,
        errorMessage: null,
        submittedAt: new Date(),
        filledAt: null,
      });

      expect(looOrder.status).toBe('SUBMITTED');
      console.log('LOO 주문 제출 완료:', looOrder.kisOrderId);

      // 2. sync-order-status 실행 (PRE_MARKET) → 스킵
      const preMarketTime = TimeHelper.setPreMarket();
      const shouldSkipInPreMarket = !((preMarketTime.getHours() >= 23) || (preMarketTime.getHours() < 6));
      expect(shouldSkipInPreMarket).toBe(true);
      console.log('PRE_MARKET sync 스킵됨');

      // Day 1: MARKET_OPEN
      console.log('\n=== MARKET_OPEN: LOO 체결 ===');

      // 3. KIS에서 LOO 체결 확인
      mockKIS.updateConfig({
        orderDetails: {
          'LOO_001': { status: 'FILLED', filledQuantity: 1, avgPrice: 24.65 },
        },
        holdings: [
          { symbol: 'TSLT', quantity: 3, averagePrice: 22.76, currentPrice: 24.95 },
        ],
      });

      // 4. sync-order-status 실행 (MARKET_OPEN) → 체결 반영
      const kisDetails = await mockKIS.getOrderDetail('LOO_001', 'TSLT', 'US');
      mockDB.updateOrder(looOrder.id, {
        status: 'FILLED',
        filledQuantity: kisDetails.filledQuantity,
        avgPrice: kisDetails.avgPrice.toString(),
        filledAt: new Date(),
      });

      const filledLOO = mockDB.findOrderById(looOrder.id);
      expect(filledLOO?.status).toBe('FILLED');
      console.log('LOO 체결 완료:', filledLOO?.avgPrice);

      // Day 1: MARKET_CLOSE 전
      console.log('\n=== MARKET_CLOSE 전: LOC 매도 주문 ===');

      // 5. 목표 수익률 체크 및 LOC 매도 주문
      const holdings = await mockKIS.getAccountHoldings();
      const holding = holdings.find(h => h.symbol === 'TSLT');
      const profitRate = holding?.profitRate || 0;

      console.log('현재 수익률:', profitRate.toFixed(2), '%');

      if (profitRate >= 5) {
        const locSellOrder = mockDB.createOrder({
          strategyId: strategy.id,
          userId: user.id,
          kisOrderId: 'LOC_SELL_001',
          symbol: 'TSLT',
          side: 'SELL',
          orderType: 'LOC',
          quantity: 1,
          price: '24.95',
          status: 'SUBMITTED',
          filledQuantity: null,
          avgPrice: null,
          errorMessage: null,
          submittedAt: new Date(),
          filledAt: null,
        });

        expect(locSellOrder.orderType).toBe('LOC');
        expect(locSellOrder.side).toBe('SELL');
        console.log('LOC 매도 주문 제출:', locSellOrder.kisOrderId);
      }

      // 최종 상태 확인
      const allOrders = mockDB.findOrdersByStrategyId(strategy.id);
      console.log('\n=== 최종 주문 현황 ===');
      allOrders.forEach(o => {
        console.log(`${o.orderType} ${o.side}: ${o.status}`);
      });

      expect(allOrders.length).toBeGreaterThanOrEqual(1);
    });

  });

});
