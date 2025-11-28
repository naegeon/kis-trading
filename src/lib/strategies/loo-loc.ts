import { Strategy, LooLocStrategyParams } from '@/types/strategy';
import { KISClient } from '../kis/client';
import { LooLocOrderToSubmit } from '@/types/order';
import { db } from '../db/client';
import { orders as ordersSchema, strategies as strategiesSchema } from '../db/schema';
import { and, eq, gte } from 'drizzle-orm';
import { sendPushNotification } from '../push/notification';
import { log } from '../logger';
import { isUSWeekend, getUSMarketStatus, canEvaluateLOC, getMinutesSinceRegularMarketOpen } from '../market-hours';

/**
 * LOO/LOC 기간 전략을 실행합니다.
 * @param strategy - 실행할 전략 객체
 * @param kisClient - KIS API 클라이언트
 */
export async function executeLooLocStrategy(
  strategy: Strategy,
  kisClient: KISClient,
) {
  const params = strategy.parameters as LooLocStrategyParams;

  // 0. 시장 검증 (Phase 2 - Task 2.1.2)
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
    return;
  }

  // 0.1 주말 체크 - 주말에는 미국 시장이 휴장
  if (isUSWeekend()) {
    await log('INFO', `주말 - 미국 시장 휴장. 전략 실행 스킵.`, {}, strategy.userId, strategy.id);
    return;
  }

  // 0.2 현재 시장 상태 확인 (서머타임 자동 적용)
  const marketStatus = getUSMarketStatus();
  await log('INFO', `시장 상태: ${marketStatus.currentSession}, 서머타임: ${marketStatus.isDST ? '적용' : '미적용'}`, {}, strategy.userId, strategy.id);

  // 1. 오늘자 주문 조회 및 중복 방지
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

  // 최종 판단: KIS 미체결 또는 DB 체결이 있으면 해당 주문 스킵
  const hasLOOOrder = kisHasLOOOrder || dbHasFilledLOOOrder;
  const hasLOCBuyOrder = kisHasLOCBuyOrder || dbHasFilledLOCBuyOrder;
  const hasLOCSellOrder = kisHasLOCSellOrder || dbHasFilledLOCSellOrder;

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

  // 3. KIS API를 통해 현재가 및 전일 종가 조회 (해외 주식용 API 사용)
  // 거래소 코드 변환: NASD -> NAS, NYSE -> NYS, AMEX -> AMS
  const exchangeCodeMap: Record<string, string> = {
    'NASD': 'NAS',
    'NYSE': 'NYS',
    'AMEX': 'AMS',
  };
  const kisExchangeCode = exchangeCodeMap[params.exchangeCode || 'NASD'] || 'NAS';

  const quote = await kisClient.getOverseasStockPriceDetail(strategy.symbol, kisExchangeCode);
  const previousClose = quote.previousClose; // 전일 종가
  const openingPrice = quote.openingPrice;   // 시가
  const currentPrice = quote.currentPrice;   // 현재가 (실시간, 장중에는 변동)

  await log('INFO', `시세 조회 완료: ${strategy.symbol} - 현재가: ${currentPrice}, 시가: ${openingPrice}, 전일종가: ${previousClose}`, {}, strategy.userId, strategy.id);

  // 4. KIS API를 통해 해당 종목 실제 보유 수량 및 평단가 조회
  const holdings = await getHoldings(kisClient, strategy.symbol);
  await log('INFO', `보유 조회 완료: ${strategy.symbol} - 보유수량: ${holdings.totalQuantity}주, 평단가: ${holdings.averagePrice.toFixed(2)}`, {}, strategy.userId, strategy.id);
  let { totalQuantity, averagePrice } = holdings;

  // 4.1 오늘 체결된 LOO 주문이 있으면 평단가에 반영
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

    // 평단가 재계산: (기존평단가 × 기존수량 + 체결가 × 체결수량) / 총수량
    if (totalQuantity + fillQty > 0) {
      averagePrice = (averagePrice * totalQuantity + fillPrice * fillQty) / (totalQuantity + fillQty);
      totalQuantity += fillQty;
    }
  }

  if (filledLOOOrders.length > 0) {
    await log('INFO', `LOO 체결 반영 완료: 새 평단가 ${averagePrice.toFixed(2)}, 총 수량 ${totalQuantity}`, {}, strategy.userId, strategy.id);
  }

  // 4.2 LOC 평가 가능 여부 확인 (정규장 시작 후 10분 경과 필요)
  const canEvaluateLOCNow = canEvaluateLOC();
  const minutesSinceOpen = getMinutesSinceRegularMarketOpen();

  if (marketStatus.isRegularMarket && !canEvaluateLOCNow) {
    await log('INFO', `정규장 시작 후 ${minutesSinceOpen}분 경과. LOC 평가는 10분 후 시작됩니다.`, {}, strategy.userId, strategy.id);
  }

  const ordersToSubmit: LooLocOrderToSubmit[] = [];

  // 5. 매수/매도 로직 실행
  // 5.1. LOO 매수 (시초가 매수) - PRD 섹션 4.3
  // LOO 주문은 프리마켓 시간에만 제출 가능
  // LOO(Limit-On-Open): 시초가가 지정가(limit price) 이하일 때 체결
  // 전략: 전일 종가를 limit price로 설정 → 갭하락(시초가 < 전일종가) 시 자동 체결
  if (!params.looEnabled) {
    await log('INFO', `LOO 매수: 비활성화됨 (looEnabled=false)`, {}, strategy.userId, strategy.id);
  } else if (hasLOOOrder) {
    await log('INFO', `LOO 매수: 오늘 이미 체결된 LOO 주문이 있습니다. 스킵.`, {}, strategy.userId, strategy.id);
  } else if (params.looEnabled && !hasLOOOrder) {
    if (marketStatus.canSubmitLOO) {
      // LOO 주문: limit price = 전일 종가
      // 시초가가 전일 종가 이하면 체결됨 (갭하락 시 매수)
      const looLimitPrice = previousClose;

      ordersToSubmit.push({
        orderType: 'LOO',
        side: 'BUY',
        quantity: params.looQty,  // LOO 전용 수량
        price: looLimitPrice,     // limit price = 전일 종가
        message: `LOO 매수 주문: 시초가가 ${looLimitPrice.toFixed(2)} USD 이하면 체결 (전일종가 기준)`,
      });

      await log('INFO', `LOO 매수 주문 예약: limit price = ${looLimitPrice.toFixed(2)} USD (전일 종가)`, {}, strategy.userId, strategy.id);
    } else {
      await log('INFO', `LOO 매수: 프리마켓 시간이 아닙니다. (현재: ${marketStatus.currentSession})`, {}, strategy.userId, strategy.id);
    }
  }

  // 5.2. LOC 추가 매수 (종가 추가 매수) - 옵션 A
  // LOC 주문은 정규장 시작 후 10분이 경과해야 제출 가능 (LOO 체결 확인 후)
  if (params.locBuyEnabled && !hasLOCBuyOrder) {
    if (canEvaluateLOCNow) {
      if (totalQuantity > 0 && currentPrice < averagePrice) {
        // 추가 매수: 평단가보다 낮을 때
        ordersToSubmit.push({
          orderType: 'LOC',
          side: 'BUY',
          quantity: params.locBuyQty,  // LOC 전용 수량
          price: currentPrice, // LOC 주문은 가격을 지정하지 않으나, 기록을 위해 현재가 사용
          message: `LOC 매수 조건 충족: 현재가(${currentPrice}) < 보유 평단가(${averagePrice.toFixed(2)})`,
        });
      } else if (totalQuantity === 0 && openingPrice > 0 && currentPrice < openingPrice) {
        // 최초 매수: 당일 음봉 (현재가 < 시초가)일 때만 LOC 매수
        ordersToSubmit.push({
          orderType: 'LOC',
          side: 'BUY',
          quantity: params.locBuyQty,  // LOC 전용 수량
          price: currentPrice, // LOC 주문은 가격을 지정하지 않으나, 기록을 위해 현재가 사용
          message: `LOC 매수 조건 충족 (최초 - 음봉): 현재가(${currentPrice}) < 시초가(${openingPrice})`,
        });
      } else if (totalQuantity === 0 && openingPrice === 0) {
        // 프리마켓에서는 시초가가 0 → LOO 주문만 가능
        await log('INFO', `LOC 매수: 시초가 미확정 (프리마켓). LOO 주문만 가능합니다.`, {}, strategy.userId, strategy.id);
      }
    } else if (marketStatus.isRegularMarket) {
      // 정규장이지만 10분 미경과
      await log('INFO', `LOC 매수 평가 대기 중: 정규장 시작 후 ${minutesSinceOpen}분 경과 (10분 필요)`, {}, strategy.userId, strategy.id);
    }
  }

  // 5.3. LOC 매도 (목표 수익률 도달 시 전량 매도)
  // LOC 주문은 정규장 시작 후 10분이 경과해야 제출 가능 (LOO 체결 확인 후)
  if (totalQuantity > 0 && !hasLOCSellOrder) {
    const targetPrice = averagePrice * (1 + params.targetReturnRate / 100);
    if (currentPrice >= targetPrice) {
      if (canEvaluateLOCNow) {
        ordersToSubmit.push({
          orderType: 'LOC',
          side: 'SELL',
          quantity: totalQuantity, // 전량 매도
          price: currentPrice, // LOC 주문은 가격을 지정하지 않으나, 기록을 위해 현재가 사용
          message: `LOC 매도 조건 충족: 현재가(${currentPrice}) >= 목표가(${targetPrice.toFixed(2)}) (수익률 ${params.targetReturnRate}%)`,
        });
      } else if (marketStatus.isRegularMarket) {
        // 정규장이지만 10분 미경과
        await log('INFO', `LOC 매도 평가 대기 중: 정규장 시작 후 ${minutesSinceOpen}분 경과 (10분 필요). 목표가: ${targetPrice.toFixed(2)}`, {}, strategy.userId, strategy.id);
      }
    }
  }

  // 6. 주문 제출
  for (const order of ordersToSubmit) {
    try {
      await log('INFO', `KIS API 주문 제출 시작: ${order.orderType} ${order.side} ${order.quantity}주 @ ${order.price}`, {}, strategy.userId, strategy.id);

      const result = await kisClient.submitOrder({
        symbol: strategy.symbol,
        side: order.side,
        orderType: order.orderType,
        quantity: order.quantity,
        price: order.price,
        market: strategy.market, // 시장 구분 (US/KR)
        exchangeCode: params.exchangeCode, // 거래소 코드 추가
      });

      await log('INFO', `KIS API 주문 제출 성공: orderId = ${result.orderId}`, {}, strategy.userId, strategy.id);

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

      await log('INFO', `주문 DB 저장 완료: ${strategy.symbol} ${order.orderType} ${order.side}`, {}, strategy.userId, strategy.id);

      // Send push notification for successful LOO/LOC order submission
      await sendPushNotification(
        strategy.userId,
        'LOO/LOC 주문 제출 성공',
        `${strategy.name} 전략: ${strategy.symbol} ${order.side === 'BUY' ? '매수' : '매도'} ${order.quantity}주 (${order.price} USD) 주문이 제출되었습니다.`,
        `/orders` // Link to orders page
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      await log('ERROR', `KIS API 주문 제출 실패: ${order.orderType} ${order.side} - ${errorMessage}`, { error: errorMessage }, strategy.userId, strategy.id);

      await sendPushNotification(
        strategy.userId,
        'LOO/LOC 주문 제출 실패',
        `${strategy.name} 전략: ${strategy.symbol} ${order.side === 'BUY' ? '매수' : '매도'} ${order.quantity}주 (${order.price} USD) 주문 제출에 실패했습니다. 오류: ${errorMessage}`,
        `/orders` // Link to orders page
      );
    }
  }
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
    const holding = holdings.find(h => h.symbol === symbol);

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
