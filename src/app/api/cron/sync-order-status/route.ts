import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { orders, credentials, strategies, performanceMetrics, executionLogs, strategies as strategiesSchema, orders as ordersSchema } from '@/lib/db/schema';
import { eq, inArray, and, lte, isNotNull } from 'drizzle-orm';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { log } from '@/lib/logger';
import { Order } from '@/types/order';
import { Strategy } from '@/types/strategy';
import { sendPushNotification } from '@/lib/push/notification';
import { calculateDailyStrategyMetrics } from '@/lib/performance/calculator';
import { KISHolding } from '@/lib/kis/types';
import { isLooLocParams, isValidExchangeCode } from '@/lib/utils/type-guards';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

// Helper to group orders by user and then by strategy
function groupOrdersByUserAndStrategy(pendingOrders: (Order & { strategy: Strategy })[]) {
  const grouped: Record<string, Record<string, (Order & { strategy: Strategy })[]>> = {};

  for (const order of pendingOrders) {
    // Skip orders that are not associated with a strategy
    if (!order.strategyId) {
      continue;
    }

    if (!grouped[order.userId]) {
      grouped[order.userId] = {};
    }
    if (!grouped[order.userId][order.strategyId]) {
      grouped[order.userId][order.strategyId] = [];
    }
    grouped[order.userId][order.strategyId].push(order);
  }
  return grouped;
}

// Helper to check if market is closed
function checkMarketClosed(market: 'US' | 'KR', now: Date): boolean {
  const kstHour = now.getHours();
  const kstMinute = now.getMinutes();

  if (market === 'US') {
    // 미국 정규장: 한국시간 23:30-06:00 (다음날)
    // 07:00-22:59는 마감 시간대
    if (kstHour >= 7 && kstHour < 23) {
      return true;
    }
    // 23시인데 30분 이전이면 마감
    if (kstHour === 23 && kstMinute < 30) {
      return true;
    }
    return false;
  } else {
    // 국내 정규장: 09:00-15:30
    if (kstHour < 9) {
      return true; // 오전 9시 이전
    }
    if (kstHour > 15) {
      return true; // 오후 3시 이후
    }
    if (kstHour === 15 && kstMinute > 30) {
      return true; // 오후 3시 30분 이후
    }
    return false;
  }
}

// Helper to cancel expired orders
async function cancelExpiredOrders(): Promise<void> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    await log('INFO', 'Starting expired orders cancellation check.');

    // 오늘 이전에 제출된 SUBMITTED 상태 주문 조회
    const expiredOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.status, 'SUBMITTED'),
        lte(orders.submittedAt, todayStart)
      ),
      with: { strategy: true },
    });

    if (expiredOrders.length === 0) {
      await log('INFO', 'No expired orders found.');
      return;
    }

    await log('INFO', `Found ${expiredOrders.length} potentially expired orders.`);

    let cancelledCount = 0;

    for (const order of expiredOrders) {
      if (!order.strategy) {
        await log('WARN', `Order ${order.id} has no associated strategy. Marking as cancelled.`, {}, order.userId);
        await db.update(ordersSchema)
          .set({
            status: 'CANCELLED',
            errorMessage: '전략 정보 없음 - 자동 취소',
          })
          .where(eq(ordersSchema.id, order.id));
        cancelledCount++;
        continue;
      }

      const isMarketClosed = checkMarketClosed(order.strategy.market, now);

      if (isMarketClosed) {
        // 시장이 마감되었으므로 주문을 CANCELLED로 변경
        await db.update(ordersSchema)
          .set({
            status: 'CANCELLED',
            errorMessage: '장 마감으로 인한 자동 취소',
          })
          .where(eq(ordersSchema.id, order.id));

        cancelledCount++;

        await sendPushNotification(
          order.userId,
          '주문 자동 취소',
          `${order.symbol} ${order.side === 'BUY' ? '매수' : '매도'} ${order.quantity}주 주문이 미체결로 취소되었습니다.`,
          '/orders'
        );

        await log('INFO', `Order ${order.id} cancelled due to market closure.`, { symbol: order.symbol, market: order.strategy.market }, order.userId, order.strategyId || undefined);
      }
    }

    await log('INFO', `Expired orders cancellation completed. Cancelled: ${cancelledCount}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await log('ERROR', `Expired orders cancellation failed: ${errorMessage}`, { error });
  }
}

// Helper to collect performance metrics
async function collectPerformanceMetrics(): Promise<void> {
  try {
    const today = new Date();

    const allUsers = await db.query.users.findMany({
      with: {
        credentials: true,
        strategies: {
          where: eq(strategiesSchema.status, 'ACTIVE'),
        },
      },
    });

    for (const user of allUsers) {
      if (!user.credentials.length || user.strategies.length === 0) {
        await log('INFO', `Skipping user ${user.id}: No credentials or active strategies.`, {}, user.id);
        continue;
      }

      await log('INFO', `Collecting metrics for user ${user.id}`, {}, user.id);

      const cred = user.credentials[0];
      const decryptedCreds = getDecryptedCredentials(cred);

      const kisClient = new KISClient({
        appkey: decryptedCreds.appKey,
        appsecret: decryptedCreds.appSecret,
        isMock: decryptedCreds.isMock,
        accountNumber: decryptedCreds.accountNumber,
      });

      const userHoldings = await kisClient.getAccountHoldings();
      const symbolsInHoldings = userHoldings.map((h: KISHolding) => h.symbol);
      const symbolsInStrategies = user.strategies.map((s: Strategy) => s.symbol);
      const allSymbols = [...new Set([...symbolsInHoldings, ...symbolsInStrategies])];

      if (allSymbols.length === 0) {
        await log('INFO', `User ${user.id} has no symbols to process.`, {}, user.id);
        continue;
      }

      const prices: { [symbol: string]: number } = {};
      const pricePromises = allSymbols.map((symbol: string) =>
        kisClient.getStockPrice(symbol).then((priceInfo: { stck_prpr: string }) => {
          prices[symbol] = parseFloat(priceInfo.stck_prpr);
        })
      );
      await Promise.all(pricePromises);

      for (const strategy of user.strategies) {
        const strategySymbol = strategy.symbol;
        const closingPrice = prices[strategySymbol];

        if (typeof closingPrice !== 'number') {
          await log('WARN', `Could not fetch price for ${strategySymbol}. Skipping metrics.`, {}, user.id, strategy.id);
          continue;
        }

        const strategyOrders: Order[] = await db.select().from(ordersSchema).where(
          and(
            eq(ordersSchema.strategyId, strategy.id),
            eq(ordersSchema.status, 'FILLED'),
            isNotNull(ordersSchema.filledAt),
            lte(ordersSchema.filledAt, today)
          )
        );

        const strategyHoldings: KISHolding[] = userHoldings.filter((h: KISHolding) => h.symbol === strategySymbol);

        const metrics = calculateDailyStrategyMetrics({
          strategyOrders,
          strategyHoldings,
          closingPrice,
        });

        await db.insert(performanceMetrics).values({
          userId: user.id,
          strategyId: strategy.id,
          date: today,
          ...metrics,
        }).onConflictDoUpdate({
          target: [performanceMetrics.userId, performanceMetrics.strategyId, performanceMetrics.date],
          set: { ...metrics }
        });
        await log('INFO', `Metrics saved for strategy ${strategy.id}`, {}, user.id, strategy.id);
      }
    }

    // Clean up old INFO logs (30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const deletedLogs = await db.delete(executionLogs).where(
      and(
        eq(executionLogs.logLevel, 'INFO'),
        lte(executionLogs.createdAt, thirtyDaysAgo)
      )
    );
    await log('INFO', `Cleaned up ${deletedLogs.rowCount} old INFO logs.`);
    await log('INFO', 'Performance metrics collection completed.');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await log('ERROR', `Performance metrics collection failed: ${errorMessage}`, { error });
  }
}

async function syncOrderStatusHandler(req: Request) {
  // 1. Vercel Cron Job Security (only for GET requests from Vercel Cron)
  const authHeader = req.headers.get('authorization');
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // For POST requests (manual execution), skip auth in development
  if (req.method === 'GET' && !isVercelCron) {
    await log('ERROR', 'Order sync cron job unauthorized access attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  // Extract batch parameters from URL
  const url = new URL(req.url);
  const batchNumber = parseInt(url.searchParams.get('batch') || '0');
  const batchSize = parseInt(url.searchParams.get('batchSize') || '5'); // 기본 배치 크기: 5명

  await log('INFO', `Order sync cron job: Starting order status synchronization (Batch ${batchNumber}, Size ${batchSize}).`);

  try {
    // 2. Fetch all pending orders (SUBMITTED or PARTIALLY_FILLED)
    const pendingOrders = await db.query.orders.findMany({
      where: inArray(orders.status, ['SUBMITTED', 'PARTIALLY_FILLED']),
      with: { strategy: true },
    });

    if (pendingOrders.length === 0) {
      await log('INFO', 'Order sync cron job: No pending orders to synchronize.');
      return NextResponse.json({ success: true, message: 'No pending orders to synchronize.' });
    }

    // 3. Group orders by user and strategy
    const groupedOrders = groupOrdersByUserAndStrategy(pendingOrders as (Order & { strategy: Strategy })[]);
    const allUserIds = Object.keys(groupedOrders);

    // 4. Apply batch filtering
    const startIdx = batchNumber * batchSize;
    const endIdx = startIdx + batchSize;
    const batchUserIds = allUserIds.slice(startIdx, endIdx);

    if (batchUserIds.length === 0) {
      await log('INFO', `Order sync: No users in batch ${batchNumber}. Total users: ${allUserIds.length}`);
      return NextResponse.json({
        success: true,
        message: `No users in batch ${batchNumber}`,
        totalUsers: allUserIds.length,
        batchNumber,
        batchSize,
      });
    }

    await log('INFO', `Processing batch ${batchNumber}: Users ${startIdx + 1}-${Math.min(endIdx, allUserIds.length)} of ${allUserIds.length}`);

    let updatedOrdersCount = 0;
    let failedSyncCount = 0;

    // 5. Process users in current batch
    await Promise.all(
      batchUserIds.map(async (userId) => {
          const userOrders = groupedOrders[userId];
          const userCredentials = await db.query.credentials.findFirst({
            where: eq(credentials.userId, userId),
          });

          if (!userCredentials) {
            await log('WARN', `User ${userId} has no credentials. Cannot sync orders.`, {}, userId);
            failedSyncCount += Object.values(userOrders).flat().length;
            return;
          }

          const decryptedCredentials = getDecryptedCredentials(userCredentials);
          const kisClient = new KISClient({
            appkey: decryptedCredentials.appKey,
            appsecret: decryptedCredentials.appSecret,
            isMock: decryptedCredentials.isMock,
            accountNumber: decryptedCredentials.accountNumber,
          });

          for (const strategyId in userOrders) {
            const strategyOrders = userOrders[strategyId];
            const strategy = strategyOrders[0].strategy; // All orders in this group belong to the same strategy

            for (const order of strategyOrders) {
              if (!order.kisOrderId) {
                await log('WARN', `Order ${order.id} has no KIS Order ID. Skipping sync.`, {}, userId, strategyId);
                continue;
              }

              // LOO/LOC 주문은 시장 개장 전에 sync하지 않음 (체결내역 API에 나타나지 않기 때문)
              if ((order.orderType === 'LOO' || order.orderType === 'LOC') && strategy.market === 'US') {
                const now = new Date();
                const kstHour = now.getHours();
                const kstMinute = now.getMinutes();
                // US 정규장: 23:30 ~ 06:00 KST
                const isUSMarketOpen = (kstHour >= 23 && kstMinute >= 30) || (kstHour < 6);
                if (!isUSMarketOpen) {
                  await log('INFO', `Order ${order.id} is a ${order.orderType} order. Skipping sync until market opens.`, { orderType: order.orderType, symbol: order.symbol }, userId, strategyId);
                  continue;
                }
              }

              try {
                // Fetch order details from KIS API (시장별로 다른 파라미터 전달)
                const strategyParams = strategy.parameters as Record<string, unknown> | null;
                const rawExchangeCode = strategyParams?.exchangeCode;
                const exchangeCode = isValidExchangeCode(rawExchangeCode) ? rawExchangeCode : 'NASD';
                const kisOrderDetails = await kisClient.getOrderDetail(
                  order.kisOrderId,
                  order.symbol,
                  strategy.market,
                  exchangeCode
                );

                let newStatus = order.status;
                let filledQuantity = order.filledQuantity;
                let avgPrice = order.avgPrice;
                let filledAt = order.filledAt;

                // Determine new status based on KIS response
                if (kisOrderDetails.status === 'FILLED') {
                  newStatus = 'FILLED';
                  filledQuantity = kisOrderDetails.filledQuantity;
                  avgPrice = kisOrderDetails.avgPrice.toString();
                  filledAt = new Date(); // KIS API might provide this, otherwise use current time
                } else if (kisOrderDetails.status === 'PARTIALLY_FILLED') {
                  newStatus = 'PARTIALLY_FILLED';
                  filledQuantity = kisOrderDetails.filledQuantity;
                  avgPrice = kisOrderDetails.avgPrice.toString();
                } else if (kisOrderDetails.status === 'CANCELLED') {
                  newStatus = 'CANCELLED';
                } else if (kisOrderDetails.status === 'FAILED') {
                  newStatus = 'FAILED';
                }

                if (newStatus !== order.status) {
                  await db.update(orders).set({
                    status: newStatus,
                    filledQuantity: filledQuantity,
                    avgPrice: avgPrice,
                    filledAt: filledAt,
                  }).where(eq(orders.id, order.id));
                  updatedOrdersCount++;
                  await log('INFO', `Order ${order.id} status updated from ${order.status} to ${newStatus}.`, { kisOrderDetails }, userId, strategyId);

                  // Send push notification for order status change
                  let notificationTitle = '주문 상태 업데이트';
                  let notificationBody = '';
                  if (newStatus === 'FILLED') {
                    notificationTitle = '주문 체결 완료';
                    notificationBody = `${strategy.name} 전략: ${order.symbol} ${order.side === 'BUY' ? '매수' : '매도'} ${filledQuantity}주가 ${avgPrice} USD에 체결되었습니다.`;
                  } else if (newStatus === 'PARTIALLY_FILLED') {
                    notificationTitle = '주문 부분 체결';
                    notificationBody = `${strategy.name} 전략: ${order.symbol} ${order.side === 'BUY' ? '매수' : '매도'} ${filledQuantity}주가 ${avgPrice} USD에 부분 체결되었습니다.`;
                  } else if (newStatus === 'CANCELLED') {
                    notificationTitle = '주문 취소';
                    notificationBody = `${strategy.name} 전략: ${order.symbol} ${order.side === 'BUY' ? '매수' : '매도'} 주문이 취소되었습니다.`;
                  } else if (newStatus === 'FAILED') {
                    notificationTitle = '주문 실패';
                    notificationBody = `${strategy.name} 전략: ${order.symbol} ${order.side === 'BUY' ? '매수' : '매도'} 주문이 실패했습니다.`;
                  } else {
                    notificationBody = `${strategy.name} 전략: ${order.symbol} ${order.side === 'BUY' ? '매수' : '매도'} 주문 상태가 ${newStatus}로 변경되었습니다.`;
                  }

                  await sendPushNotification(
                    userId,
                    notificationTitle,
                    notificationBody,
                    `/orders` // Link to orders page
                  );

                  // If LOO/LOC strategy and order is filled, recalculate average cost
                  if (strategy.type === 'LOO_LOC' && newStatus === 'FILLED' && order.side === 'BUY') {
                    // 타입 가드로 파라미터 검증
                    if (isLooLocParams(strategy.parameters)) {
                      const params = strategy.parameters;
                      const currentAvgCost = params.currentAvgCost ?? 0;
                      const currentQty = params.currentQty ?? 0;

                      const newQty = currentQty + (filledQuantity || 0);

                      if (newQty > 0) {
                        const newAvgCost = ((currentAvgCost * currentQty) + (Number(avgPrice || 0) * (filledQuantity || 0))) / newQty;

                        await db.update(strategies).set({
                          parameters: {
                            ...params,
                            currentAvgCost: newAvgCost,
                            currentQty: newQty,
                          },
                          updatedAt: new Date(),
                        }).where(eq(strategies.id, strategy.id));
                        await log('INFO', `LOO/LOC Strategy ${strategy.id} average cost updated.`, { newAvgCost }, userId, strategyId);
                      }
                    } else {
                      await log('WARN', `LOO/LOC Strategy ${strategy.id} has invalid parameters. Skipping avg cost update.`, {}, userId, strategyId);
                    }
                  }
                }
              } catch (error) {
                failedSyncCount++;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await log('ERROR', `Error syncing order ${order.id}: ${errorMessage}`, { error }, userId, strategyId);
              }
            }
          }
      })
    );

    const summaryMessage = `Order sync batch ${batchNumber} finished. Updated: ${updatedOrdersCount}, Failed: ${failedSyncCount}. Processed users: ${batchUserIds.length}`;
    await log('INFO', summaryMessage);

    // 4. Cancel expired orders (오늘 이전 SUBMITTED 주문)
    await log('INFO', 'Starting expired orders cancellation.');
    await cancelExpiredOrders();

    // 5. Collect daily performance metrics
    await log('INFO', 'Starting performance metrics collection after order sync.');
    await collectPerformanceMetrics();

    return NextResponse.json({
      success: true,
      message: summaryMessage,
      batchNumber,
      batchSize,
      processedUsers: batchUserIds.length,
      totalUsers: allUserIds.length,
      updatedOrdersCount,
      failedSyncCount,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown internal error';
    await log('ERROR', `Order sync cron job failed: ${errorMessage}`, { error });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// GET handler for Vercel Cron
export async function GET(req: Request) {
  return syncOrderStatusHandler(req);
}

// POST handler for manual execution
export async function POST(req: Request) {
  return syncOrderStatusHandler(req);
}
