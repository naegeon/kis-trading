import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { orders, stockSymbols, strategies } from '@/lib/db/schema';
import { and, eq, desc, gte, lte, inArray, sql } from 'drizzle-orm';
import { api } from '@/lib/api';
import { getPopularStockName } from '@/lib/services/stock-name-lookup';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const { searchParams } = request.nextUrl;
  const strategyId = searchParams.get('strategyId');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  const offset = (page - 1) * limit;

  try {
    const whereConditions = [eq(orders.userId, session.user.id)];

    if (strategyId) {
      whereConditions.push(eq(orders.strategyId, strategyId));
    }
    if (status) {
      const statusArray = status.split(',') as (typeof orders.status.enumValues)[number][];
      if (statusArray.length > 0) {
        whereConditions.push(inArray(orders.status, statusArray));
      }
    }
    if (startDate) {
      whereConditions.push(gte(orders.submittedAt, new Date(startDate)));
    }
    if (endDate) {
      whereConditions.push(lte(orders.submittedAt, new Date(endDate)));
    }

    const userOrders = await db
      .select()
      .from(orders)
      .where(and(...whereConditions))
      .orderBy(desc(orders.submittedAt))
      .limit(limit)
      .offset(offset);

    // 전략 정보 미리 조회 (N+1 쿼리 최적화)
    const strategyIds = [...new Set(userOrders.map(o => o.strategyId).filter(Boolean))];
    const strategyList = strategyIds.length > 0
      ? await db.query.strategies.findMany({
          where: inArray(strategies.id, strategyIds as string[]),
        })
      : [];
    const strategyMap = new Map(strategyList.map(s => [s.id, s]));

    // 각 주문에 대해 종목명과 전략명 추가
    const ordersWithDetails = await Promise.all(
      userOrders.map(async (order) => {
        // 전략 정보
        const strategy = order.strategyId ? strategyMap.get(order.strategyId) : null;
        const strategyName = strategy?.name || null;
        const strategyType = strategy?.type || null;
        const market = (strategy?.market || 'US') as 'US' | 'KR';

        // 종목명 조회 (DB → 캐시 순서)
        let symbolName: string | null = null;

        // 1. DB에서 조회
        const symbolInfo = await db.query.stockSymbols.findFirst({
          where: and(
            eq(stockSymbols.symbol, order.symbol.toUpperCase()),
            eq(stockSymbols.market, market)
          ),
        });
        symbolName = symbolInfo?.name || null;

        // 2. DB에 없으면 캐시에서 조회
        if (!symbolName) {
          symbolName = getPopularStockName(order.symbol, market);
        }

        return {
          ...order,
          symbolName,
          strategyName,
          strategyType,
        };
      })
    );

    // 총 개수 조회
    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(...whereConditions));
    const totalCount = totalCountResult[0]?.count || 0;

    // 요약 통계 조회 (전체 주문 기준, 필터 적용)
    const summaryResult = await db
      .select({
        status: orders.status,
        count: sql<number>`count(*)`,
      })
      .from(orders)
      .where(and(...whereConditions))
      .groupBy(orders.status);

    const summary = {
      total: totalCount,
      submitted: 0,
      filled: 0,
      partiallyFilled: 0,
      cancelled: 0,
      failed: 0,
    };

    summaryResult.forEach(row => {
      switch (row.status) {
        case 'SUBMITTED':
          summary.submitted = Number(row.count);
          break;
        case 'FILLED':
          summary.filled = Number(row.count);
          break;
        case 'PARTIALLY_FILLED':
          summary.partiallyFilled = Number(row.count);
          break;
        case 'CANCELLED':
          summary.cancelled = Number(row.count);
          break;
        case 'FAILED':
          summary.failed = Number(row.count);
          break;
      }
    });

    return api.success({
      orders: ordersWithDetails,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return api.error('Failed to fetch orders', 500);
  }
}
