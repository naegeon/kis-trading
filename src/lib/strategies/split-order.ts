import { Order, NewOrder } from '../../types/order';
import { Strategy, SplitOrderParams } from '../../types/strategy';
import { KISClient } from '../kis/client';
import { isSplitOrderParams } from '../utils/type-guards';
import {
  US_PRICE_MULTIPLIER,
  KR_TICK_SIZE_TABLE,
  DEFAULT_TARGET_RETURN_RATE,
} from '../constants/trading';

/**
 * 미국 주식 주문 가격을 소수점 2자리로 반올림합니다.
 * KIS API는 $1 이상 미국 주식에 대해 소수점 2자리까지만 허용합니다.
 * @param price - 원본 가격
 * @returns 소수점 2자리로 반올림된 가격
 */
export function roundPriceForUS(price: number): number {
  return Math.round(price * US_PRICE_MULTIPLIER) / US_PRICE_MULTIPLIER;
}

/**
 * 한국 주식 호가 단위를 반환합니다.
 * @param price - 주식 가격
 * @returns 해당 가격 구간의 호가 단위
 */
export function getKRTickSize(price: number): number {
  for (const [threshold, tickSize] of KR_TICK_SIZE_TABLE) {
    if (price < threshold) {
      return tickSize;
    }
  }
  // KR_TICK_SIZE_TABLE의 마지막 항목은 Infinity이므로 여기에 도달하지 않음
  return KR_TICK_SIZE_TABLE[KR_TICK_SIZE_TABLE.length - 1][1];
}

/**
 * 한국 주식 주문 가격을 호가 단위에 맞게 조정합니다.
 * 매수 시 내림, 매도 시 올림 처리합니다.
 * @param price - 원본 가격
 * @param side - 매수/매도 구분
 * @returns 호가 단위에 맞게 조정된 가격
 */
export function roundPriceForKR(price: number, side: 'BUY' | 'SELL'): number {
  const tickSize = getKRTickSize(price);
  if (side === 'BUY') {
    // 매수: 내림 (더 저렴하게)
    return Math.floor(price / tickSize) * tickSize;
  } else {
    // 매도: 올림 (더 비싸게)
    return Math.ceil(price / tickSize) * tickSize;
  }
}

/**
 * 시장에 맞는 주문 가격을 반환합니다.
 * @param price - 원본 가격
 * @param market - 시장 구분 (US/KR)
 * @param side - 매수/매도 구분
 * @returns 시장 규칙에 맞게 조정된 가격
 */
export function roundPriceForMarket(price: number, market: 'US' | 'KR', side: 'BUY' | 'SELL'): number {
  if (market === 'KR') {
    return roundPriceForKR(price, side);
  }
  return roundPriceForUS(price);
}

/**
 * 삼각형(피라미드) 방식으로 주문 수량을 분배합니다.
 * 예: 총 15주, 5회 분할 -> [1, 2, 3, 4, 5]
 * @param totalQty 총 주문 수량
 * @param splitCount 분할 횟수
 * @returns 분할된 주문 수량 배열
 */
export function calculatePyramidDistribution(totalQty: number, splitCount: number): number[] {
  if (splitCount <= 0) return [];
  if (splitCount === 1) return [totalQty];

  const baseUnit = totalQty / (splitCount * (splitCount + 1) / 2);
  const quantities = Array.from({ length: splitCount }, (_, i) => Math.round(baseUnit * (i + 1)));

  // 반올림으로 인해 발생한 총량 차이를 마지막 주문에 보정
  const currentTotal = quantities.reduce((sum, q) => sum + q, 0);
  const diff = totalQty - currentTotal;
  if (diff !== 0) {
    quantities[quantities.length - 1] += diff;
  }

  return quantities;
}

/**
 * 균등하게 주문 수량을 분배합니다.
 * @param totalQty 총 주문 수량
 * @param splitCount 분할 횟수
 * @returns 분할된 주문 수량 배열
 */
export function calculateEqualDistribution(totalQty: number, splitCount: number): number[] {
  if (splitCount <= 0) return [];
  const baseQty = Math.floor(totalQty / splitCount);
  const remainder = totalQty % splitCount;
  
  const quantities = Array(splitCount).fill(baseQty);
  for (let i = 0; i < remainder; i++) {
    quantities[i]++;
  }

  return quantities;
}

/**
 * 역삼각형 방식으로 주문 수량을 분배합니다.
 * 예: 총 15주, 5회 분할 -> [5, 4, 3, 2, 1]
 * @param totalQty 총 주문 수량
 * @param splitCount 분할 횟수
 * @returns 분할된 주문 수량 배열
 */
export function calculateInvertedDistribution(totalQty: number, splitCount: number): number[] {
  return calculatePyramidDistribution(totalQty, splitCount).reverse();
}

/**
 * 분할 주문의 각 가격을 계산합니다.
 * @param basePrice 기준 가격
 * @param declineValue 하락 값 (금액 또는 비율)
 * @param declineUnit 하락 단위 ('USD' 또는 'PERCENT')
 * @param splitCount 분할 횟수
 * @param side 매수 또는 매도
 * @param market 시장 구분 (US/KR) - 기본값 'US'
 * @returns 분할된 주문 가격 배열
 */
export function calculateSplitPrices(
  basePrice: number,
  declineValue: number,
  declineUnit: 'USD' | 'PERCENT',
  splitCount: number,
  side: 'BUY' | 'SELL',
  market: 'US' | 'KR' = 'US'
): number[] {
  const prices: number[] = [];
  let currentPrice = basePrice;

  for (let i = 0; i < splitCount; i++) {
    if (i > 0) { // 첫 주문은 기준가로, 두 번째부터 가격 변동 적용
      const change = declineUnit === 'PERCENT' ? currentPrice * (declineValue / 100) : declineValue;
      currentPrice = side === 'BUY' ? currentPrice - change : currentPrice + change;
    }
    // 시장에 맞는 가격 단위로 조정 (US: 소수점 2자리, KR: 호가 단위)
    prices.push(roundPriceForMarket(currentPrice, market, side));
  }
  return prices;
}

import { db } from '../db/client';
import { orders as ordersSchema, strategies as strategiesSchema } from '../db/schema';
import { sendPushNotification } from '../push/notification';
import { eq, and } from 'drizzle-orm';

// ... (rest of the file is the same)

/**
 * 평단가를 계산합니다.
 * @param currentAvgCost 현재 평단가
 * @param currentQty 현재 수량
 * @param fillPrice 체결 가격
 * @param fillQty 체결 수량
 * @returns 새로운 평단가
 */
export function calculateAveragePrice(
  currentAvgCost: number,
  currentQty: number,
  fillPrice: number,
  fillQty: number
): number {
  if (currentQty + fillQty === 0) return 0;
  return (currentAvgCost * currentQty + fillPrice * fillQty) / (currentQty + fillQty);
}

import { log } from '../logger';
import { logWarning } from '../utils/error-handling';

// ============================================================================
// 헬퍼 함수들 (분리된 로직)
// ============================================================================

/**
 * 전략의 유효 기간을 검증합니다.
 * 전략 생성일과 오늘 날짜가 다르면 전략을 종료합니다.
 * @returns 전략이 유효하면 true, 종료되었으면 false
 */
export async function validateStrategyDate(
  strategy: Strategy,
  today: Date = new Date()
): Promise<boolean> {
  if (!strategy.createdAt) return true;

  const strategyCreatedDate = new Date(strategy.createdAt);

  // 날짜만 비교 (시간 제외)
  const isSameDay =
    strategyCreatedDate.getFullYear() === today.getFullYear() &&
    strategyCreatedDate.getMonth() === today.getMonth() &&
    strategyCreatedDate.getDate() === today.getDate();

  if (!isSameDay) {
    // 당일이 아니면 전략 종료
    await db.update(strategiesSchema)
      .set({
        status: 'ENDED',
        updatedAt: new Date()
      })
      .where(eq(strategiesSchema.id, strategy.id));

    await sendPushNotification(
      strategy.userId,
      '전략 자동 종료',
      `${strategy.name} 전략이 당일 유효 기간 만료로 종료되었습니다.`,
      `/strategies/${strategy.id}`
    );

    await log('INFO', `[Split-Order] Strategy ended (not same day). Created: ${strategyCreatedDate.toISOString()}, Today: ${today.toISOString()}`, {}, strategy.userId, strategy.id);

    return false;
  }

  return true;
}

/**
 * 체결된 주문을 동기화하고 평단가를 재계산합니다.
 * @returns 업데이트된 평단가, 수량, 새로 처리된 주문 ID 목록, 새 체결 여부
 */
export async function syncFilledOrders(
  strategy: Strategy,
  params: SplitOrderParams
): Promise<{
  currentAvgCost: number;
  currentQty: number;
  newProcessedIds: string[];
  hasNewFills: boolean;
}> {
  const processedOrderIds = params.processedOrderIds || [];

  const filledOrders = await db.query.orders.findMany({
    where: and(
      eq(ordersSchema.strategyId, strategy.id),
      eq(ordersSchema.status, 'FILLED'),
      eq(ordersSchema.side, 'BUY')
    ),
  });

  let currentAvgCost = params.currentAvgCost || 0;
  let currentQty = params.currentQty || 0;

  // 새로 체결된 주문만 필터링
  const newFilledOrders = filledOrders.filter(order => !processedOrderIds.includes(order.id));
  const hasNewFills = newFilledOrders.length > 0;

  const newProcessedIds: string[] = [];
  for (const order of newFilledOrders) {
    if (order.filledQuantity && order.avgPrice) {
      const fillQty = order.filledQuantity;
      const fillPrice = parseFloat(order.avgPrice.toString());
      currentAvgCost = calculateAveragePrice(currentAvgCost, currentQty, fillPrice, fillQty);
      currentQty += fillQty;
      newProcessedIds.push(order.id);

      await log('INFO', `[Split-Order] 새 체결 감지: ${fillQty}주 @ ${fillPrice}. 새 평단가: ${currentAvgCost.toFixed(2)}`, {}, strategy.userId, strategy.id);
    }
  }

  // 새 체결이 있었으면 전략 파라미터 업데이트
  if (hasNewFills) {
    const updatedParams = {
      ...params,
      currentAvgCost,
      currentQty,
      processedOrderIds: [...processedOrderIds, ...newProcessedIds],
    };

    await db.update(strategiesSchema)
      .set({
        parameters: updatedParams,
        updatedAt: new Date(),
      })
      .where(eq(strategiesSchema.id, strategy.id));

    await sendPushNotification(
      strategy.userId,
      '평단가 업데이트',
      `${strategy.name} 전략: ${newFilledOrders.length}건 체결됨. 새 평단가: ${currentAvgCost.toFixed(2)} USD, 총 수량: ${currentQty}주`,
      `/strategies/${strategy.id}`
    );
  }

  return { currentAvgCost, currentQty, newProcessedIds, hasNewFills };
}

/**
 * 개별 주문을 제출하고 결과를 처리합니다.
 * @returns 제출된 주문 또는 null (실패 시)
 */
export async function handleOrderSubmission(
  strategy: Strategy,
  params: SplitOrderParams,
  kisClient: KISClient,
  orderDetails: {
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
  }
): Promise<Order | null> {
  const { side, quantity, price } = orderDetails;

  try {
    const orderResult = params.isDaytime
      ? await kisClient.submitDaytimeOrder({
          symbol: strategy.symbol,
          side,
          orderType: 'LIMIT',
          quantity,
          price,
          market: strategy.market,
          exchangeCode: params.exchangeCode,
        })
      : await kisClient.submitOrder({
          symbol: strategy.symbol,
          side,
          orderType: 'LIMIT',
          quantity,
          price,
          market: strategy.market,
          exchangeCode: params.exchangeCode,
        });

    const newOrder: NewOrder = {
      strategyId: strategy.id,
      userId: strategy.userId,
      kisOrderId: orderResult.orderId,
      symbol: strategy.symbol,
      side,
      orderType: 'LIMIT',
      quantity,
      price: price.toString(),
      status: 'SUBMITTED',
      submittedAt: new Date(),
    };

    await db.insert(ordersSchema).values(newOrder);

    await log(
      'INFO',
      `LIMIT ${side} 주문 제출 성공: ${strategy.symbol} ${quantity}주 @ ${price} USD (orderId: ${orderResult.orderId})`,
      { orderId: orderResult.orderId, symbol: strategy.symbol, side, orderType: 'LIMIT', quantity, price },
      strategy.userId,
      strategy.id,
      'ORDER_SUBMITTED'
    );

    await sendPushNotification(
      strategy.userId,
      '주문 제출 성공',
      `${strategy.name} 전략: ${strategy.symbol} ${side === 'BUY' ? '매수' : '매도'} ${quantity}주 (${price} USD) 주문이 제출되었습니다.`,
      `/orders`
    );

    return newOrder as Order;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';

    let notificationTitle = '주문 제출 실패';
    let notificationMessage = `${strategy.name} 전략: ${strategy.symbol} ${side === 'BUY' ? '매수' : '매도'} ${quantity}주 (${price} USD) 주문 제출에 실패했습니다.`;

    if (params.isDaytime) {
      if (errorMessage.includes('모의투자') || errorMessage.includes('미지원')) {
        notificationTitle = '주간매매 불가';
        notificationMessage = `${strategy.name} 전략: 주간매매는 모의투자를 지원하지 않습니다. 실거래 계좌로 전환해주세요.`;
      } else if (errorMessage.includes('종목') || errorMessage.includes('거래불가')) {
        notificationTitle = '주간매매 불가 종목';
        notificationMessage = `${strategy.name} 전략: ${strategy.symbol}은(는) 주간매매가 지원되지 않는 종목입니다.`;
      } else {
        notificationMessage += ` (주간매매 시간: 한국시간 10:00~18:00) 오류: ${errorMessage}`;
      }
    } else {
      notificationMessage += ` 오류: ${errorMessage}`;
    }

    await sendPushNotification(strategy.userId, notificationTitle, notificationMessage, `/orders`);

    await log(
      'ERROR',
      `LIMIT ${side} 주문 제출 실패: ${strategy.symbol} ${quantity}주 @ ${price} USD - ${errorMessage}`,
      { error: errorMessage, symbol: strategy.symbol, side, orderType: 'LIMIT', quantity, price },
      strategy.userId,
      strategy.id,
      'ORDER_FAILED'
    );

    return null;
  }
}

/**
 * 매도 주문을 관리합니다 (취소, 재주문, 체결 확인).
 * @returns 제출된 매도 주문 또는 null
 */
export async function manageSellOrders(
  strategy: Strategy,
  params: SplitOrderParams,
  kisClient: KISClient,
  currentAvgCost: number,
  currentQty: number,
  hasNewFills: boolean
): Promise<Order | null> {
  if (currentQty <= 0 || currentAvgCost <= 0) {
    return null;
  }

  const targetReturnRate = params.targetReturnRate || DEFAULT_TARGET_RETURN_RATE;
  const targetSellPrice = roundPriceForMarket(
    currentAvgCost * (1 + targetReturnRate / 100),
    strategy.market as 'US' | 'KR',
    'SELL'
  );

  // 기존 매도 주문 조회
  const existingSellOrders = await db.query.orders.findMany({
    where: and(
      eq(ordersSchema.strategyId, strategy.id),
      eq(ordersSchema.side, 'SELL'),
      eq(ordersSchema.status, 'SUBMITTED')
    ),
  });

  // 새 체결이 있으면 기존 매도 주문 취소
  if (hasNewFills && existingSellOrders.length > 0) {
    await log('INFO', `[Split-Order] 새 체결로 인해 기존 매도 주문 ${existingSellOrders.length}건 취소 후 재주문`, {}, strategy.userId, strategy.id);

    for (const order of existingSellOrders) {
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
      } catch (cancelError) {
        // 취소 실패 시 로그만 남기고 계속 진행 (다른 주문 취소 시도)
        await logWarning(
          `매도 주문 취소 실패: ${order.kisOrderId}`,
          {
            operation: 'manageSellOrders',
            userId: strategy.userId,
            strategyId: strategy.id,
            metadata: { orderId: order.id, kisOrderId: order.kisOrderId },
          },
          cancelError
        );
      }
    }
  }

  // 매도 주문이 없거나 취소된 경우에만 새 주문 제출
  const hasActiveSellOrder = !hasNewFills && existingSellOrders.length > 0;

  if (!hasActiveSellOrder) {
    return handleOrderSubmission(strategy, params, kisClient, {
      side: 'SELL',
      quantity: currentQty,
      price: targetSellPrice,
    });
  }

  return null;
}

/**
 * 매수 주문들을 제출합니다.
 * @returns 제출된 매수 주문 배열
 */
export async function submitBuyOrders(
  strategy: Strategy,
  params: SplitOrderParams,
  kisClient: KISClient
): Promise<Order[]> {
  const submittedOrders: Order[] = [];

  await log('INFO', `[Split-Order] Preparing to submit buy orders. Distribution: ${params.distributionType}, Count: ${params.splitCount}`, {}, strategy.userId, strategy.id);

  // 수량 분배
  let quantities: number[];
  switch (params.distributionType) {
    case 'PYRAMID':
      quantities = calculatePyramidDistribution(params.totalAmount, params.splitCount);
      break;
    case 'INVERTED':
      quantities = calculateInvertedDistribution(params.totalAmount, params.splitCount);
      break;
    case 'EQUAL':
    default:
      quantities = calculateEqualDistribution(params.totalAmount, params.splitCount);
      break;
  }

  // 가격 계산
  const prices = calculateSplitPrices(
    params.basePrice,
    params.declineValue,
    params.declineUnit,
    params.splitCount,
    params.side,
    strategy.market as 'US' | 'KR'
  );

  // 주문 제출
  for (let i = 0; i < params.splitCount; i++) {
    const quantity = quantities[i];
    const price = prices[i];

    if (quantity <= 0) continue;

    const order = await handleOrderSubmission(strategy, params, kisClient, {
      side: params.side,
      quantity,
      price,
    });

    if (order) {
      submittedOrders.push(order);
    }
  }

  return submittedOrders;
}

// ============================================================================
// 메인 실행 함수
// ============================================================================

export async function executeSplitOrderStrategy(
  strategy: Strategy,
  kisClient: KISClient
): Promise<Order[]> {
  // 타입 가드로 파라미터 검증
  if (!isSplitOrderParams(strategy.parameters)) {
    await log('ERROR', `[Split-Order] Invalid strategy parameters for ${strategy.name}`, { parameters: strategy.parameters }, strategy.userId, strategy.id);
    return [];
  }
  const params = strategy.parameters;
  const today = new Date();

  // 0. 전략 유효 기간 검증
  const isValid = await validateStrategyDate(strategy, today);
  if (!isValid) {
    return [];
  }

  await log('INFO', `[Split-Order] Starting execution for ${strategy.name}. Current position: ${params.currentQty || 0} shares at ${params.currentAvgCost || 0}`, {}, strategy.userId, strategy.id);

  // 0-1. 당일 매수 주문 조회 (중복 방지 및 전략 수정 처리용)
  const existingBuyOrders = await db.query.orders.findMany({
    where: and(
      eq(ordersSchema.strategyId, strategy.id),
      eq(ordersSchema.side, 'BUY')
    ),
  });

  // 당일 주문만 필터링
  const todayBuyOrders = existingBuyOrders.filter(order => {
    if (!order.submittedAt) return false;
    const orderDate = new Date(order.submittedAt);
    return orderDate.getDate() === today.getDate() &&
           orderDate.getMonth() === today.getMonth() &&
           orderDate.getFullYear() === today.getFullYear();
  });

  // 당일 SUBMITTED 상태인 매수 주문
  const pendingBuyOrders = todayBuyOrders.filter(o => o.status === 'SUBMITTED');

  // 0-2. 전략 수정 여부 확인 (strategy.updatedAt vs order.submittedAt)
  const strategyUpdatedAt = strategy.updatedAt ? new Date(strategy.updatedAt) : new Date(0);
  const strategyModifiedAfterOrder = pendingBuyOrders.some(order =>
    order.submittedAt && strategyUpdatedAt > new Date(order.submittedAt)
  );

  // 전략이 수정되었으면 기존 미체결 매수 주문 취소
  if (strategyModifiedAfterOrder && pendingBuyOrders.length > 0) {
    await log('INFO', `[Split-Order] 전략 수정 감지. 기존 미체결 매수 주문 ${pendingBuyOrders.length}건 취소`, {}, strategy.userId, strategy.id);

    for (const order of pendingBuyOrders) {
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

        await log('INFO', `[Split-Order] 매수 주문 취소됨: ${order.kisOrderId}`, {}, strategy.userId, strategy.id);
      } catch (cancelError) {
        await log('WARN', `[Split-Order] 매수 주문 취소 실패: ${order.kisOrderId}`, { error: cancelError }, strategy.userId, strategy.id);
      }
    }
  }

  // 0-3. 당일 매수 주문 존재 여부 확인
  const hasSubmittedOrFilledBuyOrders = todayBuyOrders.some(o =>
    o.status === 'SUBMITTED' || o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED'
  );
  const shouldSkipBuyOrders = !strategyModifiedAfterOrder && hasSubmittedOrFilledBuyOrders;

  // 1. 체결 주문 동기화 및 평단가 재계산 (분리된 함수 사용)
  const syncResult = await syncFilledOrders(strategy, params);
  const { currentAvgCost, currentQty, hasNewFills } = syncResult;

  const submittedOrders: Order[] = [];

  // 2. 매도 주문 관리 (분리된 함수 사용)
  const sellOrder = await manageSellOrders(
    strategy,
    params,
    kisClient,
    currentAvgCost,
    currentQty,
    hasNewFills
  );
  if (sellOrder) {
    submittedOrders.push(sellOrder);
  }

  // 3. 매도 주문 체결 확인 (전략 종료 처리)
  const filledSellOrders = await db.query.orders.findMany({
    where: and(
      eq(ordersSchema.strategyId, strategy.id),
      eq(ordersSchema.side, 'SELL'),
      eq(ordersSchema.status, 'FILLED')
    ),
  });

  if (filledSellOrders.length > 0 && strategy.status === 'ACTIVE') {
    await log('INFO', `[Split-Order] Sell orders filled (${filledSellOrders.length}). Ending strategy.`, {}, strategy.userId, strategy.id);

    await db.update(strategiesSchema)
      .set({
        status: 'ENDED',
        updatedAt: new Date(),
      })
      .where(eq(strategiesSchema.id, strategy.id));

    await sendPushNotification(
      strategy.userId,
      '전략 종료 - 목표 수익 달성',
      `${strategy.name} 전략: 매도 주문이 체결되어 전략이 종료되었습니다.`,
      `/strategies/${strategy.id}`
    );

    return submittedOrders;
  }

  // 4. 매수 주문 제출 (분리된 함수 사용)
  if (shouldSkipBuyOrders) {
    const pendingCount = pendingBuyOrders.length;
    const totalCount = todayBuyOrders.filter(o => o.status !== 'CANCELLED').length;
    await log('INFO', `[Split-Order] 당일 매수 주문이 이미 존재함. 중복 방지를 위해 새 매수 주문 스킵. (SUBMITTED: ${pendingCount}, 체결 포함 총: ${totalCount})`, {}, strategy.userId, strategy.id);
  } else {
    const buyOrders = await submitBuyOrders(strategy, params, kisClient);
    submittedOrders.push(...buyOrders);
  }

  await log('INFO', `[Split-Order] Execution completed. Total orders submitted: ${submittedOrders.length}`, {}, strategy.userId, strategy.id);

  return submittedOrders;
}

