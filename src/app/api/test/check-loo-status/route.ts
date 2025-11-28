import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { strategies, orders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// 임시 디버깅 엔드포인트 - 프로덕션 배포 전 삭제 필요
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // LOO_LOC 전략 조회
    const looLocStrategies = await db.query.strategies.findMany({
      where: eq(strategies.type, 'LOO_LOC'),
    });

    // 최근 TSLT 주문 조회
    const recentOrders = await db.query.orders.findMany({
      where: eq(orders.symbol, 'TSLT'),
      limit: 20,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      looLocStrategies: looLocStrategies.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        symbol: s.symbol,
        lastExecutedAt: s.lastExecutedAt,
        createdAt: s.createdAt,
      })),
      recentTSLTOrders: recentOrders.map(o => ({
        id: o.id,
        kisOrderId: o.kisOrderId,
        side: o.side,
        orderType: o.orderType,
        quantity: o.quantity,
        price: o.price,
        status: o.status,
        submittedAt: o.submittedAt,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}
