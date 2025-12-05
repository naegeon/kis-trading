import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithCredentials } from '@/lib/api-helpers';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/account/balance
 * 계좌 잔고 정보 조회 (예수금, 평가금액, 손익 등)
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // 인증 및 자격증명 확인 (KIS 클라이언트 자동 생성)
    const authResult = await requireAuthWithCredentials();
    if (!authResult.success) {
      return authResult.response;
    }

    const { kisClient } = authResult;

    // 미국 시장과 한국 시장 잔고를 병렬로 조회
    const [usBalance, krBalance] = await Promise.allSettled([
      kisClient.getAccountBalance(),
      kisClient.getDomesticAccountBalance(),
    ]);

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
