import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { strategies, credentials } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { api } from '@/lib/api';
import { NextResponse } from 'next/server';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { executeStrategyImmediately } from '@/lib/strategies/executor';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

/**
 * POST /api/strategies/[id]/execute
 * 전략을 즉시 실행합니다.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const strategyId = params.id;

  try {
    // 전략 조회 및 권한 확인
    const [strategy] = await db
      .select()
      .from(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)));

    if (!strategy) {
      return api.error('Strategy not found or you do not have permission', 404);
    }

    // ACTIVE 상태가 아닌 전략은 실행 불가
    if (strategy.status !== 'ACTIVE') {
      return NextResponse.json({
        success: false,
        message: '비활성 상태의 전략은 실행할 수 없습니다. 먼저 전략을 활성화해주세요.',
      }, { status: 400 });
    }

    // 사용자 API 키 조회
    const userCredentials = await db.query.credentials.findFirst({
      where: eq(credentials.userId, session.user.id),
    });

    if (!userCredentials) {
      return NextResponse.json({
        success: false,
        message: 'KIS API 인증 정보가 없습니다. 설정 페이지에서 계좌 정보를 등록해주세요.',
      }, { status: 400 });
    }

    // KIS 클라이언트 초기화
    const decryptedCreds = getDecryptedCredentials(userCredentials);
    const kisClient = new KISClient({
      appkey: decryptedCreds.appKey,
      appsecret: decryptedCreds.appSecret,
      isMock: decryptedCreds.isMock,
      accountNumber: decryptedCreds.accountNumber,
      credentialsId: decryptedCreds.credentialsId,
    });

    // 즉시 실행 (10초 타임아웃)
    const executionResult = await executeStrategyImmediately(strategy, kisClient, 10000);

    return NextResponse.json({
      success: executionResult.success,
      message: executionResult.message,
      data: {
        strategyId: strategy.id,
        strategyName: strategy.name,
        executedAt: new Date().toISOString(),
      },
    }, { status: executionResult.success ? 200 : 500 });

  } catch (error) {
    console.error('Error executing strategy:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : '전략 실행 중 오류가 발생했습니다.',
    }, { status: 500 });
  }
}
