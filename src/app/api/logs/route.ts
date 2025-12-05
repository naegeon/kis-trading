import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { executionLogs } from '@/lib/db/schema';
import { desc, eq, and, gte, sql } from 'drizzle-orm';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

/**
 * GET /api/logs
 * 실행 로그 조회 API
 *
 * Query Parameters:
 * - level: 로그 레벨 필터 (INFO, WARN, ERROR)
 * - strategyId: 특정 전략의 로그만 조회
 * - limit: 조회할 로그 개수 (기본 100)
 * - since: 특정 시간 이후의 로그만 조회 (ISO 8601 format)
 */
export async function GET(request: Request) {
  try {
    // 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const url = new URL(request.url);
    const level = url.searchParams.get('level');
    const strategyId = url.searchParams.get('strategyId');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const since = url.searchParams.get('since');

    // 쿼리 조건 구성
    const conditions = [eq(executionLogs.userId, userId)];

    if (level) {
      conditions.push(eq(executionLogs.logLevel, level as 'INFO' | 'WARN' | 'ERROR'));
    }

    if (strategyId) {
      conditions.push(eq(executionLogs.strategyId, strategyId));
    }

    if (since) {
      const sinceDate = new Date(since);
      conditions.push(gte(executionLogs.createdAt, sinceDate));
    }

    // 로그 조회
    const logs = await db
      .select()
      .from(executionLogs)
      .where(and(...conditions))
      .orderBy(desc(executionLogs.createdAt))
      .limit(limit);

    // 크론잡 실행 통계 추가
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentCronLogs = await db
      .select({
        count: sql<number>`count(*)`,
        level: executionLogs.logLevel,
      })
      .from(executionLogs)
      .where(
        and(
          eq(executionLogs.userId, userId),
          gte(executionLogs.createdAt, thirtyMinutesAgo),
          sql`${executionLogs.message} LIKE '%Cron job%'`
        )
      )
      .groupBy(executionLogs.logLevel);

    return NextResponse.json({
      success: true,
      data: {
        logs,
        stats: {
          total: logs.length,
          recentCronExecutions: recentCronLogs,
        },
      },
    });
  } catch (error) {
    console.error('GET /api/logs error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
