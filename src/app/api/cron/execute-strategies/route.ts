import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { strategies, orders } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { executeSplitOrderStrategy } from '@/lib/strategies/split-order';
import { executeLooLocStrategy } from '@/lib/strategies/loo-loc';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { log } from '@/lib/logger';
import { StrategyWithUser } from '@/types/strategy';
import { sendPushNotification } from '@/lib/push/notification';
import { canExecuteStrategy } from '@/lib/strategies/executor';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

// Helper to group strategies by user ID
function groupStrategiesByUser(strategies: StrategyWithUser[]) {
  return strategies.reduce((acc, strategy) => {
    const userId = strategy.userId;
    if (!acc[userId]) {
      acc[userId] = [];
    }
    acc[userId].push(strategy);
    return acc;
  }, {} as Record<string, StrategyWithUser[]>);
}

async function executeStrategiesHandler(req: Request) {
  // 1. Vercel Cron Job Security (only for GET requests from Vercel Cron)
  const authHeader = req.headers.get('authorization');
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // For POST requests (manual execution), skip auth in development
  if (req.method === 'GET' && !isVercelCron) {
    await log('ERROR', 'Cron job unauthorized access attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  // Extract batch parameters from URL
  const url = new URL(req.url);
  const batchNumber = parseInt(url.searchParams.get('batch') || '0');
  const batchSize = parseInt(url.searchParams.get('batchSize') || '5'); // 기본 배치 크기: 5명

  await log('INFO', `Cron job: Starting strategy execution (Batch ${batchNumber}, Size ${batchSize}).`);

  try {
    // 2. Fetch all active strategies with user and credentials
    const activeStrategies = await db.query.strategies.findMany({
      where: eq(strategies.status, 'ACTIVE'),
      with: { user: { with: { credentials: true } } },
    });

    if (activeStrategies.length === 0) {
      await log('INFO', 'Cron job: No active strategies to execute.');
      return NextResponse.json({ success: true, message: 'No active strategies to execute.' });
    }

    // 3. Group strategies by user
    const strategiesByUser = groupStrategiesByUser(activeStrategies as StrategyWithUser[]);
    const allUserStrategies = Object.values(strategiesByUser);

    // 4. Apply batch filtering
    const startIdx = batchNumber * batchSize;
    const endIdx = startIdx + batchSize;
    const batchUserStrategies = allUserStrategies.slice(startIdx, endIdx);

    if (batchUserStrategies.length === 0) {
      await log('INFO', `Cron job: No users in batch ${batchNumber}. Total users: ${allUserStrategies.length}`);
      return NextResponse.json({
        success: true,
        message: `No users in batch ${batchNumber}`,
        totalUsers: allUserStrategies.length,
        batchNumber,
        batchSize,
      });
    }

    await log('INFO', `Processing batch ${batchNumber}: Users ${startIdx + 1}-${Math.min(endIdx, allUserStrategies.length)} of ${allUserStrategies.length}`);

    let executedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // 5. Process users in current batch
    await Promise.all(
      batchUserStrategies.map(async (userStrategies) => {
        const user = userStrategies[0].user;

        await log('INFO', `Processing user ${user.email} with ${userStrategies.length} active strategies`, {}, user.id);

        if (!user.credentials?.length) {
          await log('WARN', `User ${user.id} (${user.email}) has no credentials. Skipping.`, {}, user.id);
          return;
        }

        // Decrypt credentials and create KISClient
        const decryptedCredentials = getDecryptedCredentials(user.credentials[0]);
        const kisClient = new KISClient({
          appkey: decryptedCredentials.appKey,
          appsecret: decryptedCredentials.appSecret,
          isMock: decryptedCredentials.isMock,
          accountNumber: decryptedCredentials.accountNumber,
          credentialsId: decryptedCredentials.credentialsId,
        });

        // Execute all active strategies for the user
        for (const strategy of userStrategies) {
          // 중복 실행 방지: 분할주문 전략만 10분 체크 적용
          // LOO/LOC 전략은 자체 중복 방지 로직(hasLOOOrder, hasLOCOrder)이 있으므로 스킵하지 않음
          if (strategy.type === 'SPLIT_ORDER' && !canExecuteStrategy(strategy)) {
            await log('INFO', `Strategy ${strategy.id} was executed recently (within 10 minutes). Skipping to prevent duplicate execution.`, {}, user.id, strategy.id);
            skippedCount++;
            continue;
          }

          // Check strategy end conditions
          if (strategy.endDate && new Date(strategy.endDate) < new Date()) {
            await db.update(strategies).set({ status: 'ENDED' }).where(eq(strategies.id, strategy.id));
            await log('INFO', `Strategy ${strategy.id} ended due to endDate.`, {}, user.id, strategy.id);

              // Send push notification for strategy ending
            await sendPushNotification(
              user.id,
              '전략 종료',
              `${strategy.name} 전략이 종료일 도달로 인해 종료되었습니다.`,
              `/strategies/${strategy.id}` // Link to strategy detail page
            );
            continue; // Skip execution for ended strategy
          }

          // Check if there are pending BUY orders for split-order strategies
          // For split-order: only skip if there are SUBMITTED buy orders FROM TODAY
          // For LOO/LOC: always execute to check conditions
          if (strategy.type === 'SPLIT_ORDER') {
            const pendingBuyOrders = await db.query.orders.findMany({
              where: and(
                eq(orders.strategyId, strategy.id),
                eq(orders.side, 'BUY'),
                eq(orders.status, 'SUBMITTED')
              ),
            });

            // 당일 주문만 필터링 (이전 날짜 주문은 무시)
            const today = new Date();
            const todayOrders = pendingBuyOrders.filter(order => {
              const orderDate = new Date(order.submittedAt);
              return orderDate.getDate() === today.getDate() &&
                     orderDate.getMonth() === today.getMonth() &&
                     orderDate.getFullYear() === today.getFullYear();
            });

            if (todayOrders.length > 0) {
              await log('INFO', `Strategy ${strategy.id} (${strategy.name}) has ${todayOrders.length} pending buy orders (today). Skipping to avoid duplicate orders.`, {}, user.id, strategy.id);
              skippedCount++;
              continue; // Skip if there are pending buy orders from today
            } else if (pendingBuyOrders.length > 0 && todayOrders.length === 0) {
              // 이전 날짜 주문만 있는 경우 로그 기록
              await log('INFO', `Strategy ${strategy.id} has ${pendingBuyOrders.length} old pending orders (not today). Will execute normally.`, {}, user.id, strategy.id);
            }
          }

          try {
            await log('INFO', `Executing strategy: ${strategy.name} (${strategy.type}, Symbol: ${strategy.symbol}, Market: ${strategy.market})`, {}, user.id, strategy.id);

            switch (strategy.type) {
              case 'SPLIT_ORDER': {
                const result = await executeSplitOrderStrategy(strategy, kisClient);
                await log('INFO', `Split-order strategy executed successfully. ${result.length} orders submitted.`, {}, user.id, strategy.id);
                break;
              }
              case 'LOO_LOC': {
                await executeLooLocStrategy(strategy, kisClient);
                await log('INFO', `LOO/LOC strategy executed successfully.`, {}, user.id, strategy.id);
                break;
              }
              default:
                await log('WARN', `Unknown strategy type: ${strategy.type}`, {}, user.id, strategy.id);
            }

            // 성공 시 lastExecutedAt 업데이트
            await db
              .update(strategies)
              .set({ lastExecutedAt: new Date() })
              .where(eq(strategies.id, strategy.id));

            executedCount++;
          } catch (error) {
            failedCount++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : '';
            await log('ERROR', `Error executing strategy ${strategy.id} (${strategy.name}): ${errorMessage}`, { error: errorMessage, stack: errorStack }, user.id, strategy.id);

            // 실패 시에도 lastExecutedAt 업데이트 (무한 재시도 방지)
            await db
              .update(strategies)
              .set({ lastExecutedAt: new Date() })
              .where(eq(strategies.id, strategy.id));
          }
        }
      })
    );

    const summaryMessage = `Cron job batch ${batchNumber} finished. Executed: ${executedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}. Processed users: ${batchUserStrategies.length}`;
    await log('INFO', summaryMessage);
    return NextResponse.json({
      success: true,
      message: summaryMessage,
      batchNumber,
      batchSize,
      processedUsers: batchUserStrategies.length,
      totalUsers: allUserStrategies.length,
      executedCount,
      skippedCount,
      failedCount,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown internal error';
    await log('ERROR', `Cron job for executing strategies failed: ${errorMessage}`, { error });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// GET handler for Vercel Cron
export async function GET(req: Request) {
  return executeStrategiesHandler(req);
}

// POST handler for manual execution
export async function POST(req: Request) {
  return executeStrategiesHandler(req);
}
