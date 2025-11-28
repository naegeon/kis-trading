import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { orders, strategies, credentials } from '@/lib/db/schema';
import { eq, and, isNull, or, notInArray } from 'drizzle-orm';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { log } from '@/lib/logger';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

/**
 * 고아 주문 정리 API
 * - 전략이 삭제되었거나 비활성화된 주문 취소
 * - DB에 SUBMITTED인데 전략이 없는 주문 정리
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // force=true면 모든 SUBMITTED 주문 정리 (전략 상태 무관)
  const { searchParams } = new URL(request.url);
  const forceAll = searchParams.get('force') === 'true';

  try {
    // 1. 사용자 API 자격증명 조회
    const userCredentials = await db.query.credentials.findFirst({
      where: eq(credentials.userId, userId),
    });

    if (!userCredentials) {
      return NextResponse.json({
        success: false,
        error: 'API credentials not found',
      }, { status: 403 });
    }

    // 2. KIS 클라이언트 초기화
    const decryptedCreds = getDecryptedCredentials(userCredentials);
    const kisClient = new KISClient({
      appkey: decryptedCreds.appKey,
      appsecret: decryptedCreds.appSecret,
      isMock: decryptedCreds.isMock,
      accountNumber: decryptedCreds.accountNumber,
      credentialsId: decryptedCreds.credentialsId,
    });

    // 3. 사용자의 모든 활성 전략 ID 조회
    const activeStrategies = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(and(
        eq(strategies.userId, userId),
        eq(strategies.status, 'ACTIVE')
      ));

    const activeStrategyIds = activeStrategies.map(s => s.id);

    // 4. 고아 주문 조회
    let orphanedOrders;
    if (forceAll) {
      // force=true: 모든 SUBMITTED 주문 정리 (전략 상태 무관)
      orphanedOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.userId, userId),
          eq(orders.status, 'SUBMITTED')
        ),
      });
    } else if (activeStrategyIds.length > 0) {
      // 일반 모드: 전략이 삭제되었거나 비활성화된 주문만
      orphanedOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.userId, userId),
          eq(orders.status, 'SUBMITTED'),
          or(
            isNull(orders.strategyId),
            notInArray(orders.strategyId, activeStrategyIds)
          )
        ),
      });
    } else {
      // 활성 전략이 없으면 모든 SUBMITTED 주문이 고아
      orphanedOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.userId, userId),
          eq(orders.status, 'SUBMITTED')
        ),
      });
    }

    if (orphanedOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orphaned orders found',
        cancelledCount: 0,
      });
    }

    await log('INFO', `${forceAll ? '[강제 모드] ' : ''}고아 주문 정리 시작: ${orphanedOrders.length}건 발견`, {}, userId);

    // 5. 각 고아 주문 취소
    let cancelledCount = 0;
    let failedCount = 0;
    const results: Array<{ orderId: string; kisOrderId: string | null; status: string; error?: string }> = [];

    for (const order of orphanedOrders) {
      if (!order.kisOrderId) {
        // kisOrderId가 없으면 DB만 업데이트
        await db.update(orders)
          .set({ status: 'CANCELLED' })
          .where(eq(orders.id, order.id));

        results.push({
          orderId: order.id,
          kisOrderId: null,
          status: 'cancelled_db_only',
        });
        cancelledCount++;
        continue;
      }

      try {
        // KIS API로 주문 취소
        // 주문의 시장 정보가 필요 - orders 테이블에 없으면 기본값 사용
        await kisClient.cancelOrder({
          kisOrderId: order.kisOrderId,
          symbol: order.symbol,
          quantity: order.quantity,
          market: 'US', // LOO/LOC은 미국 시장만 지원
          exchangeCode: 'NASD', // 기본값 (실제로는 전략에서 가져와야 하지만 전략이 없음)
        });

        // DB 상태 업데이트
        await db.update(orders)
          .set({ status: 'CANCELLED' })
          .where(eq(orders.id, order.id));

        results.push({
          orderId: order.id,
          kisOrderId: order.kisOrderId,
          status: 'cancelled',
        });
        cancelledCount++;

        await log('INFO', `고아 주문 취소 완료: ${order.kisOrderId}`, {}, userId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // KIS에서 이미 취소/체결된 주문인 경우 DB만 업데이트
        // "매매가능한 수량이 없습니다" = 이미 취소되었거나 체결된 주문
        const isAlreadyCancelled = errorMessage.includes('매매가능한 수량이 없습니다') ||
                                   errorMessage.includes('주문이 없습니다') ||
                                   errorMessage.includes('already cancelled') ||
                                   errorMessage.includes('not found');

        if (isAlreadyCancelled) {
          // KIS에서 이미 없는 주문이므로 DB 상태만 업데이트
          await db.update(orders)
            .set({ status: 'CANCELLED' })
            .where(eq(orders.id, order.id));

          results.push({
            orderId: order.id,
            kisOrderId: order.kisOrderId,
            status: 'cancelled_already_done',
          });
          cancelledCount++;

          await log('INFO', `고아 주문 DB 정리 (KIS에서 이미 취소됨): ${order.kisOrderId}`, {}, userId);
        } else {
          results.push({
            orderId: order.id,
            kisOrderId: order.kisOrderId,
            status: 'failed',
            error: errorMessage,
          });
          failedCount++;

          await log('WARN', `고아 주문 취소 실패: ${order.kisOrderId} - ${errorMessage}`, { error: errorMessage }, userId);
        }
      }
    }

    await log('INFO', `고아 주문 정리 완료: 성공 ${cancelledCount}건, 실패 ${failedCount}건`, {}, userId);

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${cancelledCount} orphaned orders`,
      cancelledCount,
      failedCount,
      results,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await log('ERROR', `고아 주문 정리 실패: ${errorMessage}`, { error }, userId);
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}

/**
 * 고아 주문 조회 (정리하지 않고 목록만 확인)
 */
export async function GET(_request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // 활성 전략 ID 조회
    const activeStrategies = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(and(
        eq(strategies.userId, userId),
        eq(strategies.status, 'ACTIVE')
      ));

    const activeStrategyIds = activeStrategies.map(s => s.id);

    // 고아 주문 조회
    let orphanedOrders;
    if (activeStrategyIds.length > 0) {
      orphanedOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.userId, userId),
          eq(orders.status, 'SUBMITTED'),
          or(
            isNull(orders.strategyId),
            notInArray(orders.strategyId, activeStrategyIds)
          )
        ),
      });
    } else {
      orphanedOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.userId, userId),
          eq(orders.status, 'SUBMITTED')
        ),
      });
    }

    return NextResponse.json({
      success: true,
      orphanedOrders: orphanedOrders.map(o => ({
        id: o.id,
        kisOrderId: o.kisOrderId,
        symbol: o.symbol,
        side: o.side,
        orderType: o.orderType,
        quantity: o.quantity,
        price: o.price,
        submittedAt: o.submittedAt,
        strategyId: o.strategyId,
      })),
      count: orphanedOrders.length,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}
