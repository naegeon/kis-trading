import { Order, NewOrder } from '../../types/order';
import { Strategy, SplitOrderParams } from '../../types/strategy';
import { KISClient } from '../kis/client';

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
 * @returns 분할된 주문 가격 배열
 */
export function calculateSplitPrices(
  basePrice: number,
  declineValue: number,
  declineUnit: 'USD' | 'PERCENT',
  splitCount: number,
  side: 'BUY' | 'SELL'
): number[] {
  const prices: number[] = [];
  let currentPrice = basePrice;

  for (let i = 0; i < splitCount; i++) {
    if (i > 0) { // 첫 주문은 기준가로, 두 번째부터 가격 변동 적용
      const change = declineUnit === 'PERCENT' ? currentPrice * (declineValue / 100) : declineValue;
      currentPrice = side === 'BUY' ? currentPrice - change : currentPrice + change;
    }
    // KIS API는 가격 단위에 맞춰야 함 (여기서는 간단히 소수점 2자리로)
    prices.push(parseFloat(currentPrice.toFixed(2)));
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

export async function executeSplitOrderStrategy(
  strategy: Strategy,
  kisClient: KISClient
): Promise<Order[]> {
  const params = strategy.parameters as SplitOrderParams;
  const today = new Date();

  // 0. 전략 생성 날짜 확인 (당일만 유효)
  if (strategy.createdAt) {
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

      return [];  // 빈 배열 반환하여 실행 중단
    }
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

  // 0-3. 당일 매수 주문 존재 여부 확인 (SUBMITTED 또는 FILLED/PARTIALLY_FILLED)
  // 전략 수정 후 취소된 경우는 제외하고 다시 체크
  const currentPendingBuyOrders = strategyModifiedAfterOrder
    ? [] // 방금 취소했으므로 없음
    : pendingBuyOrders;

  const hasSubmittedOrFilledBuyOrders = todayBuyOrders.some(o =>
    o.status === 'SUBMITTED' || o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED'
  );

  // 전략이 수정되지 않았고, 당일 매수 주문(제출 또는 체결)이 있으면 새 매수 주문 스킵
  const shouldSkipBuyOrders = !strategyModifiedAfterOrder && hasSubmittedOrFilledBuyOrders;

  // 1. 최근 체결된 주문 확인 및 평단가 재계산
  // 중요: 이미 처리된 주문은 다시 계산하지 않기 위해 processedOrderIds를 사용
  const processedOrderIds = params.processedOrderIds || [];

  const filledOrders = await db.query.orders.findMany({
    where: and(
      eq(ordersSchema.strategyId, strategy.id),
      eq(ordersSchema.status, 'FILLED'),
      eq(ordersSchema.side, 'BUY') // 매수 주문만 평단가 계산
    ),
  });

  // 기존 평단가와 수량 (이미 처리된 주문 기반)
  let currentAvgCost = params.currentAvgCost || 0;
  let currentQty = params.currentQty || 0;

  // 새로 체결된 주문만 필터링 (아직 처리되지 않은 주문)
  const newFilledOrders = filledOrders.filter(order => !processedOrderIds.includes(order.id));
  const hasNewFills = newFilledOrders.length > 0;

  // 새로 체결된 주문이 있으면 평단가 재계산
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

  // 새 체결이 있었으면 전략 파라미터 업데이트 (processedOrderIds 포함)
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

    // 알림 전송
    await sendPushNotification(
      strategy.userId,
      '평단가 업데이트',
      `${strategy.name} 전략: ${newFilledOrders.length}건 체결됨. 새 평단가: ${currentAvgCost.toFixed(2)} USD, 총 수량: ${currentQty}주`,
      `/strategies/${strategy.id}`
    );
  }

  // 2. 매수 체결 확인 후 목표가 매도 주문 관리
  const targetReturnRate = params.targetReturnRate || 10; // 기본 10%
  const submittedOrders: Order[] = [];

  if (currentQty > 0 && currentAvgCost > 0) {
    // 목표 매도가 계산 (평단가 * (1 + 목표수익률/100))
    const targetSellPrice = currentAvgCost * (1 + targetReturnRate / 100);

    // 기존 매도 주문 조회 (SUBMITTED 상태만)
    const existingSellOrders = await db.query.orders.findMany({
      where: and(
        eq(ordersSchema.strategyId, strategy.id),
        eq(ordersSchema.side, 'SELL'),
        eq(ordersSchema.status, 'SUBMITTED')
      ),
    });

    // 새로운 체결이 있을 때만 기존 매도 주문 취소 및 재주문
    // (평단가가 변경되었으므로 목표가도 변경됨)
    if (hasNewFills && existingSellOrders.length > 0) {
      await log('INFO', `[Split-Order] 새 체결로 인해 기존 매도 주문 ${existingSellOrders.length}건 취소 후 재주문`, {}, strategy.userId, strategy.id);

      // 기존 매도 주문 모두 취소
      for (const order of existingSellOrders) {
        try {
          // kisOrderId가 null인 경우 스킵
          if (!order.kisOrderId) {
            continue;
          }

          await kisClient.cancelOrder({
            kisOrderId: order.kisOrderId,
            symbol: strategy.symbol,
            quantity: order.quantity,
            market: strategy.market, // 시장 구분 (US/KR)
            exchangeCode: params.exchangeCode, // 거래소 코드 (NASD/NYSE/AMEX)
          });

          await db.update(ordersSchema)
            .set({
              status: 'CANCELLED',
            })
            .where(eq(ordersSchema.id, order.id));
        } catch {
          // Order cancellation failed, log for debugging
        }
      }
    }

    // 매도 주문이 없거나, 새 체결로 취소된 경우에만 새 매도 주문 제출
    const hasActiveSellOrder = !hasNewFills && existingSellOrders.length > 0;

    if (!hasActiveSellOrder) {
      try {
        // 새로운 지정가 매도 주문 제출
        // 주간매매 플래그 확인
        const sellOrderResult = params.isDaytime
          ? await kisClient.submitDaytimeOrder({
              symbol: strategy.symbol,
              side: 'SELL',
              orderType: 'LIMIT', // 주간매매는 지정가만 가능
              quantity: currentQty,
              price: targetSellPrice,
              market: strategy.market, // US만 가능
              exchangeCode: params.exchangeCode, // 거래소 코드 (NASD/NYSE/AMEX)
            })
          : await kisClient.submitOrder({
              symbol: strategy.symbol,
              side: 'SELL',
              orderType: 'LIMIT', // 지정가 매도
              quantity: currentQty,
              price: targetSellPrice,
              market: strategy.market, // 시장 구분 (US/KR)
              exchangeCode: params.exchangeCode, // 거래소 코드 (NASD/NYSE/AMEX)
            });

        const sellOrder: NewOrder = {
          strategyId: strategy.id,
          userId: strategy.userId,
          kisOrderId: sellOrderResult.orderId,
          symbol: strategy.symbol,
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: currentQty,
          price: targetSellPrice.toString(),
          status: 'SUBMITTED',
          submittedAt: new Date(),
        };

        await db.insert(ordersSchema).values(sellOrder);
        submittedOrders.push(sellOrder as Order);

        // 알림 전송
        await sendPushNotification(
          strategy.userId,
          '매도 주문 제출',
          `${strategy.name} 전략: 평단가 ${currentAvgCost.toFixed(2)} USD 기준, 목표가 ${targetSellPrice.toFixed(2)} USD에 ${currentQty}주 매도 주문이 제출되었습니다.`,
          `/orders`
        );
      } catch (error) {
        // 에러가 발생해도 전략 실행은 계속 진행
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';

        // 주간매매 관련 에러 안내
        let notificationTitle = '매도 주문 제출 실패';
        let notificationMessage = `${strategy.name} 전략: 매도 주문 제출에 실패했습니다.`;

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

        await sendPushNotification(
          strategy.userId,
          notificationTitle,
          notificationMessage,
          `/orders`
        );

        await log('ERROR', `[Split-Order] Failed to submit sell order: ${errorMessage}`, { error: errorMessage }, strategy.userId, strategy.id);
      }
    }
  }

  // 2. 매도 주문 체결 확인 (전략 종료 처리)
  const filledSellOrders = await db.query.orders.findMany({
    where: and(
      eq(ordersSchema.strategyId, strategy.id),
      eq(ordersSchema.side, 'SELL'),
      eq(ordersSchema.status, 'FILLED')
    ),
  });

  if (filledSellOrders.length > 0 && strategy.status === 'ACTIVE') {
    await log('INFO', `[Split-Order] Sell orders filled (${filledSellOrders.length}). Ending strategy.`, {}, strategy.userId, strategy.id);

    // 전략 상태를 ENDED로 변경
    await db.update(strategiesSchema)
      .set({
        status: 'ENDED',
        updatedAt: new Date(),
      })
      .where(eq(strategiesSchema.id, strategy.id));

    // 알림 전송
    await sendPushNotification(
      strategy.userId,
      '전략 종료 - 목표 수익 달성',
      `${strategy.name} 전략: 매도 주문이 체결되어 전략이 종료되었습니다.`,
      `/strategies/${strategy.id}`
    );

    return submittedOrders;
  }

  // 3. 당일 매수 주문이 없거나 전략 수정으로 취소된 경우에만 새 매수 주문 제출
  if (shouldSkipBuyOrders) {
    await log('INFO', `[Split-Order] 당일 매수 주문이 이미 존재함. 중복 방지를 위해 새 매수 주문 스킵. (SUBMITTED: ${currentPendingBuyOrders.length}, 체결 포함 총: ${todayBuyOrders.filter(o => o.status !== 'CANCELLED').length})`, {}, strategy.userId, strategy.id);
  } else {
    await log('INFO', `[Split-Order] Preparing to submit buy orders. Distribution: ${params.distributionType}, Count: ${params.splitCount}`, {}, strategy.userId, strategy.id);

    // 3-1. 분할 매수 주문 수량 분배
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

    // 3-2. 분할 매수 주문 가격 계산
    const prices = calculateSplitPrices(
      params.basePrice,
      params.declineValue,
      params.declineUnit,
      params.splitCount,
      params.side
    );

    // 3-3. 분할 매수 주문 생성 및 제출
    for (let i = 0; i < params.splitCount; i++) {
      const quantity = quantities[i];
      const price = prices[i];

      if (quantity <= 0) continue;

      try {
        // 주간매매 플래그 확인하여 적절한 API 호출
        const orderResult = params.isDaytime
          ? await kisClient.submitDaytimeOrder({
              symbol: strategy.symbol,
              side: params.side,
              orderType: 'LIMIT', // 주간매매는 지정가만 가능
              quantity,
              price,
              market: strategy.market, // US만 가능
              exchangeCode: params.exchangeCode, // 거래소 코드 (NASD/NYSE/AMEX)
            })
          : await kisClient.submitOrder({
              symbol: strategy.symbol,
              side: params.side,
              orderType: 'LIMIT', // 분할 주문은 지정가
              quantity,
              price,
              market: strategy.market, // 시장 구분 (US/KR)
              exchangeCode: params.exchangeCode, // 거래소 코드 (NASD/NYSE/AMEX)
            });

        const newOrder: NewOrder = {
          strategyId: strategy.id,
          userId: strategy.userId,
          kisOrderId: orderResult.orderId,
          symbol: strategy.symbol,
          side: params.side,
          orderType: 'LIMIT',
          quantity,
          price: price.toString(),
          status: 'SUBMITTED',
          submittedAt: new Date(),
        };

        await db.insert(ordersSchema).values(newOrder);
        submittedOrders.push(newOrder as Order); // Cast to Order for consistency

        // Send push notification for successful order submission
        await sendPushNotification(
          strategy.userId,
          '주문 제출 성공',
          `${strategy.name} 전략: ${strategy.symbol} ${params.side === 'BUY' ? '매수' : '매도'} ${quantity}주 (${price} USD) 주문이 제출되었습니다.`,
          `/orders` // Link to orders page
        );

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';

        // 주간매매 관련 에러인지 확인
        let notificationTitle = '주문 제출 실패';
        let notificationMessage = `${strategy.name} 전략: ${strategy.symbol} ${params.side === 'BUY' ? '매수' : '매도'} ${quantity}주 (${price} USD) 주문 제출에 실패했습니다.`;

        if (params.isDaytime) {
          // 주간매매 특정 에러 메시지 체크
          if (errorMessage.includes('모의투자') || errorMessage.includes('미지원')) {
            notificationTitle = '주간매매 불가';
            notificationMessage = `${strategy.name} 전략: 주간매매는 모의투자를 지원하지 않습니다. 실거래 계좌로 전환해주세요.`;
          } else if (errorMessage.includes('종목') || errorMessage.includes('거래불가')) {
            notificationTitle = '주간매매 불가 종목';
            notificationMessage = `${strategy.name} 전략: ${strategy.symbol}은(는) 주간매매가 지원되지 않는 종목입니다. 다른 종목을 선택하거나 정규장 전략으로 변경해주세요.`;
          } else {
            notificationMessage += ` (주간매매 시간: 한국시간 10:00~18:00) 오류: ${errorMessage}`;
          }
        } else {
          notificationMessage += ` 오류: ${errorMessage}`;
        }

        await sendPushNotification(
          strategy.userId,
          notificationTitle,
          notificationMessage,
          `/orders` // Link to orders page
        );

        await log('ERROR', `[Split-Order] Failed to submit buy order ${i+1}/${params.splitCount}: ${errorMessage}`, { error: errorMessage, price, quantity }, strategy.userId, strategy.id);
      }
    }
  } // end of else block (shouldSkipBuyOrders === false)

  await log('INFO', `[Split-Order] Execution completed. Total orders submitted: ${submittedOrders.length}`, {}, strategy.userId, strategy.id);

  return submittedOrders;
}

