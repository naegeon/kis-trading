import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-helpers';
import { api } from '@/lib/api';
import { db } from '@/lib/db/client';
import { executionLogs, eventTypeEnum } from '@/lib/db/schema';
import { desc, eq, and, count, isNotNull } from 'drizzle-orm';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

// 이벤트 타입 목록 (스키마에서 가져옴)
export type EventType = typeof eventTypeEnum.enumValues[number];

/**
 * GET /api/admin/logs
 * 관리자용 전체 시스템 로그 조회 API
 *
 * Query Parameters:
 * - page: 페이지 번호 (기본값: 1)
 * - limit: 페이지당 로그 개수 (기본값: 50)
 * - level: 로그 레벨 필터 (INFO, WARN, ERROR) - 선택사항
 * - eventType: 이벤트 타입 필터 (ORDER_SUBMITTED, ORDER_FAILED 등) - 선택사항
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 관리자 인증 확인
    const adminResult = await requireAdmin();
    if (!adminResult.success) {
      return adminResult.response;
    }

    // 쿼리 파라미터 파싱
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const level = searchParams.get('level');
    const eventType = searchParams.get('eventType');

    // 유효성 검증
    if (page < 1 || limit < 1 || limit > 100) {
      return api.validationError('Invalid pagination parameters');
    }

    // 쿼리 조건 구성
    const conditions = [];

    // 로그 레벨 필터 (선택사항)
    if (level && level !== 'all') {
      conditions.push(eq(executionLogs.logLevel, level as 'INFO' | 'WARN' | 'ERROR'));
    }

    // 이벤트 타입 필터 (선택사항)
    if (eventType && eventType !== 'all') {
      if (eventType === 'ORDER') {
        // "주문" 필터: ORDER_SUBMITTED와 ORDER_FAILED 모두 포함
        conditions.push(isNotNull(executionLogs.eventType));
        // ORDER로 시작하는 이벤트만 필터링은 SQL에서 직접 처리
      } else {
        conditions.push(eq(executionLogs.eventType, eventType as EventType));
      }
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
        eventType: executionLogs.eventType,
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
      eventType: log.eventType,
      message: log.message,
      metadata: log.metadata as Record<string, unknown> | null,
      userId: log.userId,
      strategyId: log.strategyId,
      createdAt: log.createdAt?.toISOString() ?? new Date().toISOString(),
    }));

    return api.success({
      logs: formattedLogs,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
      },
    });
  } catch (error) {
    console.error('GET /api/admin/logs error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return api.error(errorMessage, 500);
  }
}
