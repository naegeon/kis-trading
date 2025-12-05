import { Strategy, LooLocStrategyParams } from '@/types/strategy';
import { KISClient } from '../kis/client';
import { LooLocOrderToSubmit } from '@/types/order';
import { db } from '../db/client';
import { orders as ordersSchema, strategies as strategiesSchema } from '../db/schema';
import { and, eq, gte } from 'drizzle-orm';
import { sendPushNotification } from '../push/notification';
import { log } from '../logger';
import { isUSWeekend, getUSMarketStatus, canEvaluateLOC, getMinutesSinceRegularMarketOpen } from '../market-hours';
import { roundPriceForUS } from './split-order';
import { isLooLocParams } from '../utils/type-guards';
import { getExchangeCodeForPrice, EXCHANGE_CODES } from '../constants/trading';
import { LOC_EVALUATION_WAIT_MINUTES } from '../constants/market';

// 미국 시장 전용이므로 roundPriceForUS를 사용 (별칭으로 유지)
const roundPriceToTwoDecimals = roundPriceForUS;

// ====================================
// Phase 2.2: 분리된 헬퍼 함수들
// ====================================

/**
 * 시장 조건을 검증합니다.
 * @returns 전략을 계속 실행할지 여부 (false면 종료)
 */
export async function validateMarketConditions(
  strategy: Strategy
): Promise<{ shouldContinue: boolean; marketStatus: ReturnType<typeof getUSMarketStatus> | null }> {
  // 0. 시장 검증 - 미국 시장만 지원
  if (strategy.market !== 'US') {
    console.error('[LOO/LOC] Strategy is not for US market. Ending strategy.');
    await db.update(strategiesSchema)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(eq(strategiesSchema.id, strategy.id));

    await sendPushNotification(
      strategy.userId,
      'LOO/LOC 전략 종료',
      `${strategy.name} 전략: LOO/LOC는 미국 시장에서만 사용 가능합니다.`,
      `/strategies/${strategy.id}`
    );
    return { shouldContinue: false, marketStatus: null };
  }

  // 0.1 주말 체크 - 주말에는 미국 시장이 휴장
  if (isUSWeekend()) {
    await log('INFO', `주말 - 미국 시장 휴장. 전략 실행 스킵.`, {}, strategy.userId, strategy.id);
    return { shouldContinue: false, marketStatus: null };
  }

  // 0.2 현재 시장 상태 확인 (서머타임 자동 적용)
  const marketStatus = getUSMarketStatus();
  await log('INFO', `시장 상태: ${marketStatus.currentSession}, 서머타임: ${marketStatus.isDST ? '적용' : '미적용'}`, {}, strategy.userId, strategy.id);

  return { shouldContinue: true, marketStatus };
}

/**
 * 당일 주문을 조회하고 중복 여부를 확인합니다.
 */
export interface TodayOrdersStatus {
  hasLOOOrder: boolean;
  hasLOCBuyOrder: boolean;
  hasLOCSellOrder: boolean;
  todayOrders: (typeof ordersSchema.$inferSelect)[]; // 재사용을 위해 반환
}

export async function syncTodayOrders(
  strategy: Strategy,
  params: LooLocStrategyParams,
  kisClient: KISClient
): Promise<TodayOrdersStatus> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayOrders = await db.select()
    .from(ordersSchema)
    .where(
      and(
        eq(ordersSchema.strategyId, strategy.id),
        gte(ordersSchema.submittedAt, today)
      )
    );

  // 주문 타입별 미체결 주문 필터링 (SUBMITTED 상태)
  const pendingLOOOrders = todayOrders.filter(o =>
    o.status === 'SUBMITTED' && o.orderType === 'LOO'
  );
  const pendingLOCBuyOrders = todayOrders.filter(o =>
    o.status === 'SUBMITTED' && o.orderType === 'LOC' && o.side === 'BUY'
  );
  const pendingLOCSellOrders = todayOrders.filter(o =>
    o.status === 'SUBMITTED' && o.orderType === 'LOC' && o.side === 'SELL'
  );

  // 전략 수정 여부 확인 (모든 미체결 주문 대상)
  const allPendingOrders = [...pendingLOOOrders, ...pendingLOCBuyOrders, ...pendingLOCSellOrders];
  const strategyUpdatedAt = strategy.updatedAt ? new Date(strategy.updatedAt) : new Date(0);
  const strategyModifiedAfterOrder = allPendingOrders.some(order =>
    order.submittedAt && strategyUpdatedAt > new Date(order.submittedAt)
  );

  // 전략이 수정되었으면 모든 미체결 주문 취소
  if (strategyModifiedAfterOrder && allPendingOrders.length > 0) {
    await log('INFO', `전략이 수정되어 ${allPendingOrders.length}개의 미체결 주문을 취소합니다.`, {}, strategy.userId, strategy.id);

    for (const order of allPendingOrders) {
      try {
        if (!order.kisOrderId) continue;

        await kisClient.cancelOrder({
          kisOrderId: order.kisOrderId,
          symbol: strategy.symbol,
          quantity: order.quantity,
          market: strategy.market,
          exchangeCode: params.exchangeCode,
        });

        await db.update(ordersSchema)
          .set({ status: 'CANCELLED' })
          .where(eq(ordersSchema.id, order.id));

        await log('INFO', `주문 취소 완료: ${order.kisOrderId}`, {}, strategy.userId, strategy.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        await log('WARN', `주문 취소 실패: ${order.kisOrderId}`, { error: errorMessage }, strategy.userId, strategy.id);
      }
    }
  }

  // ✅ KIS API에서 실제 미체결 주문 조회 (DB 상태와 무관하게 중복 방지)
  const kisUnfilledOrders = await kisClient.getOverseasUnfilledOrders(
    strategy.symbol,
    params.exchangeCode || 'NASD'
  );
  await log('INFO', `KIS 미체결 조회 완료: ${strategy.symbol} - ${kisUnfilledOrders.length}건`, {
    orders: kisUnfilledOrders.map(o => ({ orderId: o.orderId, type: o.orderType, side: o.side, qty: o.unfilledQuantity }))
  }, strategy.userId, strategy.id);

  // KIS 실제 미체결 주문 기준으로 중복 체크
  const kisHasLOOOrder = kisUnfilledOrders.some(o => o.orderType === 'LOO' && o.side === 'BUY');
  const kisHasLOCBuyOrder = kisUnfilledOrders.some(o => o.orderType === 'LOC' && o.side === 'BUY');
  const kisHasLOCSellOrder = kisUnfilledOrders.some(o => o.orderType === 'LOC' && o.side === 'SELL');

  // DB 기준 체결된 주문 확인 (FILLED/PARTIALLY_FILLED는 KIS에 없으므로 DB에서 체크)
  const dbHasFilledLOOOrder = todayOrders.some(o =>
    o.orderType === 'LOO' && o.side === 'BUY' &&
    (o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED')
  );
  const dbHasFilledLOCBuyOrder = todayOrders.some(o =>
    o.orderType === 'LOC' && o.side === 'BUY' &&
    (o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED')
  );
  const dbHasFilledLOCSellOrder = todayOrders.some(o =>
    o.orderType === 'LOC' && o.side === 'SELL' &&
    (o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED')
  );

  // 최종 판단: KIS 미체결 또는 DB 체결/미체결이 있으면 해당 주문 스킵
  const hasLOOOrder = kisHasLOOOrder || dbHasFilledLOOOrder || pendingLOOOrders.length > 0;
  const hasLOCBuyOrder = kisHasLOCBuyOrder || dbHasFilledLOCBuyOrder || pendingLOCBuyOrders.length > 0;
  const hasLOCSellOrder = kisHasLOCSellOrder || dbHasFilledLOCSellOrder || pendingLOCSellOrders.length > 0;

  // DB와 KIS 상태 불일치 경고 (DB는 CANCELLED인데 KIS에 미체결 있는 경우)
  if (kisUnfilledOrders.length > 0) {
    const dbCancelledButKisActive = todayOrders.filter(dbOrder =>
      dbOrder.status === 'CANCELLED' &&
      kisUnfilledOrders.some(kisOrder => kisOrder.orderId === dbOrder.kisOrderId)
    );
    if (dbCancelledButKisActive.length > 0) {
      await log('WARN', `DB-KIS 상태 불일치 감지: DB에서 취소로 표시되었지만 KIS에 미체결 ${dbCancelledButKisActive.length}건 존재`, {
        dbCancelled: dbCancelledButKisActive.map(o => o.kisOrderId),
      }, strategy.userId, strategy.id);

      // DB 상태를 KIS 실제 상태로 복구
      for (const dbOrder of dbCancelledButKisActive) {
        await db.update(ordersSchema)
          .set({ status: 'SUBMITTED' })
          .where(eq(ordersSchema.id, dbOrder.id));
        await log('INFO', `DB 상태 복구: ${dbOrder.kisOrderId} CANCELLED -> SUBMITTED`, {}, strategy.userId, strategy.id);
      }
    }
  }

  return { hasLOOOrder, hasLOCBuyOrder, hasLOCSellOrder, todayOrders };
}

/**
 * LOO 매수 조건을 평가하고 주문을 생성합니다.
 */
export async function evaluateLOOCondition(
  strategy: Strategy,
  params: LooLocStrategyParams,
  marketStatus: ReturnType<typeof getUSMarketStatus>,
  hasLOOOrder: boolean,
  previousClose: number
): Promise<LooLocOrderToSubmit | null> {
  if (!params.looEnabled) {
    await log('INFO', `LOO 매수: 비활성화됨 (looEnabled=false)`, {}, strategy.userId, strategy.id);
    return null;
  }

  if (hasLOOOrder) {
    await log('INFO', `LOO 매수: 오늘 이미 체결된 LOO 주문이 있습니다. 스킵.`, {}, strategy.userId, strategy.id);
    return null;
  }

  if (!marketStatus.canSubmitLOO) {
    await log('INFO', `LOO 매수: 프리마켓 시간이 아닙니다. (현재: ${marketStatus.currentSession})`, {}, strategy.userId, strategy.id);
    return null;
  }

  // LOO 주문: limit price = 전일 종가 (소수점 2자리로 반올림)
  const looLimitPrice = roundPriceToTwoDecimals(previousClose);
  await log('INFO', `LOO 매수 주문 예약: limit price = ${looLimitPrice.toFixed(2)} USD (전일 종가)`, {}, strategy.userId, strategy.id);

  return {
    orderType: 'LOO',
    side: 'BUY',
    quantity: params.looQty,
    price: looLimitPrice,
    message: `LOO 매수 주문: 시초가가 ${looLimitPrice.toFixed(2)} USD 이하면 체결 (전일종가 기준)`,
  };
}

/**
 * LOC 매수 조건을 평가하고 주문을 생성합니다.
 */
export async function evaluateLOCBuyCondition(
  strategy: Strategy,
  params: LooLocStrategyParams,
  marketStatus: ReturnType<typeof getUSMarketStatus>,
  hasLOCBuyOrder: boolean,
  canEvaluateLOCNow: boolean,
  minutesSinceOpen: number,
  totalQuantity: number,
  averagePrice: number,
  openingPrice: number
): Promise<LooLocOrderToSubmit | null> {
  if (!params.locBuyEnabled || hasLOCBuyOrder) {
    return null;
  }

  if (!canEvaluateLOCNow) {
    if (marketStatus.isRegularMarket) {
      await log('INFO', `LOC 매수 대기 중: 정규장 시작 후 ${minutesSinceOpen}분 경과 (${LOC_EVALUATION_WAIT_MINUTES}분 필요)`, {}, strategy.userId, strategy.id);
    }
    return null;
  }

  if (totalQuantity > 0) {
    // 추가 매수: 평단가를 limit price로 설정
    const locBuyLimitPrice = roundPriceToTwoDecimals(averagePrice);
    await log('INFO', `LOC 매수 주문 예약: limit price = ${locBuyLimitPrice.toFixed(2)} USD (평단가), 수량: ${params.locBuyQty}주`, {}, strategy.userId, strategy.id);

    return {
      orderType: 'LOC',
      side: 'BUY',
      quantity: params.locBuyQty,
      price: locBuyLimitPrice,
      message: `LOC 매수 주문: 종가가 ${locBuyLimitPrice.toFixed(2)} USD 이하면 체결 (평단가 기준)`,
    };
  } else if (totalQuantity === 0 && openingPrice > 0) {
    // 최초 매수: 시초가를 limit price로 설정 (음봉 조건)
    const locBuyLimitPrice = roundPriceToTwoDecimals(openingPrice);
    await log('INFO', `LOC 매수 주문 예약 (최초-음봉): limit price = ${locBuyLimitPrice.toFixed(2)} USD (시초가), 수량: ${params.locBuyQty}주`, {}, strategy.userId, strategy.id);

    return {
      orderType: 'LOC',
      side: 'BUY',
      quantity: params.locBuyQty,
      price: locBuyLimitPrice,
      message: `LOC 매수 주문 (최초-음봉): 종가가 ${locBuyLimitPrice.toFixed(2)} USD 이하면 체결 (시초가 기준)`,
    };
  } else if (totalQuantity === 0 && openingPrice === 0) {
    await log('INFO', `LOC 매수: 시초가 미확정 (프리마켓). LOO 주문만 가능합니다.`, {}, strategy.userId, strategy.id);
  }

  return null;
}

/**
 * LOC 매도 조건을 평가하고 주문을 생성합니다.
 */
export async function evaluateLOCSellCondition(
  strategy: Strategy,
  params: LooLocStrategyParams,
  marketStatus: ReturnType<typeof getUSMarketStatus>,
  hasLOCSellOrder: boolean,
  canEvaluateLOCNow: boolean,
  minutesSinceOpen: number,
  totalQuantity: number,
  averagePrice: number
): Promise<LooLocOrderToSubmit | null> {
  if (totalQuantity <= 0 || hasLOCSellOrder) {
    return null;
  }

  const targetPrice = roundPriceToTwoDecimals(averagePrice * (1 + params.targetReturnRate / 100));

  if (!canEvaluateLOCNow) {
    if (marketStatus.isRegularMarket) {
      await log('INFO', `LOC 매도 대기 중: 정규장 시작 후 ${minutesSinceOpen}분 경과 (${LOC_EVALUATION_WAIT_MINUTES}분 필요). 목표가: ${targetPrice.toFixed(2)}`, {}, strategy.userId, strategy.id);
    }
    return null;
  }

  await log('INFO', `LOC 매도 주문 예약: limit price = ${targetPrice.toFixed(2)} USD (목표가), 수량: ${totalQuantity}주`, {}, strategy.userId, strategy.id);

  return {
    orderType: 'LOC',
    side: 'SELL',
    quantity: totalQuantity,
    price: targetPrice,
    message: `LOC 매도 주문: 종가가 ${targetPrice.toFixed(2)} USD 이상이면 체결 (평단가 ${roundPriceToTwoDecimals(averagePrice).toFixed(2)} + 수익률 ${params.targetReturnRate}%)`,
  };
}

/**
 * LOO/LOC 주문을 제출합니다.
 */
export async function submitLooLocOrders(
  strategy: Strategy,
  params: LooLocStrategyParams,
  kisClient: KISClient,
  ordersToSubmit: LooLocOrderToSubmit[]
): Promise<void> {
  for (const order of ordersToSubmit) {
    try {
      await log('INFO', `KIS API 주문 제출 시작: ${order.orderType} ${order.side} ${order.quantity}주 @ ${order.price}`, {}, strategy.userId, strategy.id);

      const result = await kisClient.submitOrder({
        symbol: strategy.symbol,
        side: order.side,
        orderType: order.orderType,
        quantity: order.quantity,
        price: order.price,
        market: strategy.market,
        exchangeCode: params.exchangeCode,
      });

      await db.insert(ordersSchema).values({
        strategyId: strategy.id,
        userId: strategy.userId,
        kisOrderId: result.orderId,
        symbol: strategy.symbol,
        side: order.side,
        orderType: order.orderType,
        quantity: order.quantity,
        price: order.price?.toString() ?? null,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      });

      await log(
        'INFO',
        `${order.orderType} ${order.side} 주문 제출 성공: ${strategy.symbol} ${order.quantity}주 @ ${order.price} USD (orderId: ${result.orderId})`,
        { orderId: result.orderId, symbol: strategy.symbol, side: order.side, orderType: order.orderType, quantity: order.quantity, price: order.price },
        strategy.userId,
        strategy.id,
        'ORDER_SUBMITTED'
      );

      await sendPushNotification(
        strategy.userId,
        'LOO/LOC 주문 제출 성공',
        `${strategy.name} 전략: ${strategy.symbol} ${order.side === 'BUY' ? '매수' : '매도'} ${order.quantity}주 (${order.price} USD) 주문이 제출되었습니다.`,
        `/orders`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';

      await log(
        'ERROR',
        `${order.orderType} ${order.side} 주문 제출 실패: ${strategy.symbol} ${order.quantity}주 @ ${order.price} USD - ${errorMessage}`,
        { error: errorMessage, symbol: strategy.symbol, side: order.side, orderType: order.orderType, quantity: order.quantity, price: order.price },
        strategy.userId,
        strategy.id,
        'ORDER_FAILED'
      );

      await sendPushNotification(
        strategy.userId,
        'LOO/LOC 주문 제출 실패',
        `${strategy.name} 전략: ${strategy.symbol} ${order.side === 'BUY' ? '매수' : '매도'} ${order.quantity}주 (${order.price} USD) 주문 제출에 실패했습니다. 오류: ${errorMessage}`,
        `/orders`
      );
    }
  }
}

/**
 * LOO/LOC 기간 전략을 실행합니다. (Phase 2.2 리팩토링 적용)
 * @param strategy - 실행할 전략 객체
 * @param kisClient - KIS API 클라이언트
 */
export async function executeLooLocStrategy(
  strategy: Strategy,
  kisClient: KISClient,
) {
  // 타입 가드로 파라미터 검증
  if (!isLooLocParams(strategy.parameters)) {
    await log('ERROR', `[LOO/LOC] Invalid strategy parameters for ${strategy.name}`, { parameters: strategy.parameters }, strategy.userId, strategy.id);
    return;
  }
  const params = strategy.parameters;

  // 1. 시장 조건 검증 (분리된 함수 사용)
  const { shouldContinue, marketStatus } = await validateMarketConditions(strategy);
  if (!shouldContinue || !marketStatus) {
    return;
  }

  // 2. 당일 주문 조회 및 중복 체크 (분리된 함수 사용)
  const { hasLOOOrder, hasLOCBuyOrder, hasLOCSellOrder, todayOrders } = await syncTodayOrders(strategy, params, kisClient);

  // 3. KIS API를 통해 현재가 및 전일 종가 조회
  const kisExchangeCode = getExchangeCodeForPrice(params.exchangeCode || EXCHANGE_CODES.NASDAQ);

  const quote = await kisClient.getOverseasStockPriceDetail(strategy.symbol, kisExchangeCode);
  const previousClose = quote.previousClose;
  const openingPrice = quote.openingPrice;
  const currentPrice = quote.currentPrice;

  await log('INFO', `시세 조회 완료: ${strategy.symbol} - 현재가: ${currentPrice}, 시가: ${openingPrice}, 전일종가: ${previousClose}`, {}, strategy.userId, strategy.id);

  // 4. 보유 수량 및 평단가 조회
  const holdings = await getHoldings(kisClient, strategy.symbol);
  await log('INFO', `보유 조회 완료: ${strategy.symbol} - 보유수량: ${holdings.totalQuantity}주, 평단가: ${holdings.averagePrice.toFixed(2)}`, {}, strategy.userId, strategy.id);
  let { totalQuantity, averagePrice } = holdings;

  // 4.1 오늘 체결된 LOO 주문 평단가 반영 (todayOrders는 syncTodayOrders에서 이미 조회됨)
  const filledLOOOrders = todayOrders.filter(o =>
    o.orderType === 'LOO' &&
    o.side === 'BUY' &&
    o.status === 'FILLED' &&
    o.filledQuantity &&
    o.avgPrice
  );

  for (const looOrder of filledLOOOrders) {
    const fillQty = looOrder.filledQuantity!;
    const fillPrice = parseFloat(looOrder.avgPrice!);
    if (totalQuantity + fillQty > 0) {
      averagePrice = (averagePrice * totalQuantity + fillPrice * fillQty) / (totalQuantity + fillQty);
      totalQuantity += fillQty;
    }
  }

  if (filledLOOOrders.length > 0) {
    await log('INFO', `LOO 체결 반영 완료: 새 평단가 ${averagePrice.toFixed(2)}, 총 수량 ${totalQuantity}`, {}, strategy.userId, strategy.id);
  }

  // 4.2 LOC 평가 가능 여부 확인
  const canEvaluateLOCNow = canEvaluateLOC();
  const minutesSinceOpen = getMinutesSinceRegularMarketOpen();

  if (marketStatus.isRegularMarket && !canEvaluateLOCNow) {
    await log('INFO', `정규장 시작 후 ${minutesSinceOpen}분 경과. LOC 평가는 ${LOC_EVALUATION_WAIT_MINUTES}분 후 시작됩니다.`, {}, strategy.userId, strategy.id);
  }

  // 5. 주문 조건 평가 (분리된 함수들 사용)
  const ordersToSubmit: LooLocOrderToSubmit[] = [];

  // 5.1 LOO 매수 조건 평가
  const looOrder = await evaluateLOOCondition(strategy, params, marketStatus, hasLOOOrder, previousClose);
  if (looOrder) ordersToSubmit.push(looOrder);

  // 5.2 LOC 매수 조건 평가
  const locBuyOrder = await evaluateLOCBuyCondition(
    strategy, params, marketStatus, hasLOCBuyOrder,
    canEvaluateLOCNow, minutesSinceOpen,
    totalQuantity, averagePrice, openingPrice
  );
  if (locBuyOrder) ordersToSubmit.push(locBuyOrder);

  // 5.3 LOC 매도 조건 평가
  const locSellOrder = await evaluateLOCSellCondition(
    strategy, params, marketStatus, hasLOCSellOrder,
    canEvaluateLOCNow, minutesSinceOpen,
    totalQuantity, averagePrice
  );
  if (locSellOrder) ordersToSubmit.push(locSellOrder);

  // 6. 주문 제출 (분리된 함수 사용)
  await submitLooLocOrders(strategy, params, kisClient, ordersToSubmit);
}

/**
 * KIS API를 통해 특정 종목의 실제 보유 수량과 평균 단가를 조회합니다.
 * @param kisClient - KIS API 클라이언트
 * @param symbol - 종목 코드
 * @returns 보유 수량과 평균 단가
 */
async function getHoldings(kisClient: KISClient, symbol: string) {
  try {
    const holdings = await kisClient.getAccountHoldings();
    // 디버깅: 전체 보유 종목 출력
    // eslint-disable-next-line no-console
    console.log(`[getHoldings] 전체 보유 종목 (${holdings.length}개):`, holdings.map(h => ({ symbol: h.symbol, qty: h.quantity })));

    const holding = holdings.find(h => h.symbol === symbol);
    // eslint-disable-next-line no-console
    console.log(`[getHoldings] ${symbol} 검색 결과:`, holding ? { qty: holding.quantity, avgPrice: holding.averagePrice } : 'NOT FOUND');

    return {
      totalQuantity: holding?.quantity || 0,
      averagePrice: holding?.averagePrice || 0,
    };
  } catch (error) {
    console.error(`[getHoldings] KIS API 보유 조회 실패:`, error);
    // API 실패 시 0 반환 (보유 없음으로 처리)
    return {
      totalQuantity: 0,
      averagePrice: 0,
    };
  }
}
