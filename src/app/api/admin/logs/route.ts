import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { executionLogs } from '@/lib/db/schema';
import { desc, eq, and, count } from 'drizzle-orm';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/logs
 * 관리자용 전체 시스템 로그 조회 API
 *
 * Query Parameters:
 * - page: 페이지 번호 (기본값: 1)
 * - limit: 페이지당 로그 개수 (기본값: 50)
 * - level: 로그 레벨 필터 (INFO, WARN, ERROR) - 선택사항
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 관리자 권한 확인 (환경변수 기반)
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && session.user.email !== adminEmail) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // 쿼리 파라미터 파싱
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const level = searchParams.get('level');

    // 유효성 검증
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    // 쿼리 조건 구성
    const conditions = [];

    // 로그 레벨 필터 (선택사항)
    if (level && level !== 'all') {
      conditions.push(eq(executionLogs.logLevel, level as 'INFO' | 'WARN' | 'ERROR'));
    }

    // WHERE 절 생성
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 전체 로그 개수 조회 (페이지네이션용)
    const [totalCountResult] = await db
      .select({ count: count() })
      .from(executionLogs)
      .where(whereClause);

    const totalCount = totalCountResult?.count ?? 0;
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;

    // 로그 조회 (페이지네이션 적용)
    const logs = await db
      .select({
        id: executionLogs.id,
        logLevel: executionLogs.logLevel,
        message: executionLogs.message,
        metadata: executionLogs.metadata,
        userId: executionLogs.userId,
        strategyId: executionLogs.strategyId,
        createdAt: executionLogs.createdAt,
      })
      .from(executionLogs)
      .where(whereClause)
      .orderBy(desc(executionLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // 응답 형식 변환
    const formattedLogs = logs.map((log) => ({
      id: log.id,
      logLevel: log.logLevel,
      message: log.message,
      metadata: log.metadata as Record<string, unknown> | null,
      userId: log.userId,
      strategyId: log.strategyId,
      createdAt: log.createdAt?.toISOString() ?? new Date().toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        logs: formattedLogs,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
        },
      },
    });
  } catch (error) {
    console.error('GET /api/admin/logs error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
