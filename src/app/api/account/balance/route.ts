import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { credentials } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/account/balance
 * 계좌 잔고 정보 조회 (예수금, 평가금액, 손익 등)
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return api.error('Unauthorized', 401);
    }

    // 사용자의 KIS API 자격증명 조회
    const userCredentials = await db.query.credentials.findFirst({
      where: eq(credentials.userId, session.user.id),
    });

    if (!userCredentials) {
      return api.error('KIS API credentials not found. Please register your API keys in Settings.', 404);
    }

    // KIS API 클라이언트 초기화
    const decryptedCreds = getDecryptedCredentials(userCredentials);
    const kisClient = new KISClient({
      appkey: decryptedCreds.appKey,
      appsecret: decryptedCreds.appSecret,
      isMock: decryptedCreds.isMock,
      accountNumber: decryptedCreds.accountNumber,
      credentialsId: decryptedCreds.credentialsId,
    });

    // 미국 시장과 한국 시장 잔고를 병렬로 조회
    const [usBalance, krBalance] = await Promise.allSettled([
      kisClient.getAccountBalance(),
      kisClient.getDomesticAccountBalance(),
    ]);

    // 디버깅용 로그는 제거됨 (프로덕션 빌드 에러 방지)

    // 성공한 데이터만 병합
    const balance = {
      foreignCurrency: usBalance.status === 'fulfilled' ? usBalance.value.foreignCurrency : undefined,
      domesticCurrency: krBalance.status === 'fulfilled' ? krBalance.value.domesticCurrency : undefined,
    };

    return api.success(balance);
  } catch (error) {
    console.error('GET /api/account/balance error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch account balance';
    return api.error(errorMessage, 500);
  }
}
