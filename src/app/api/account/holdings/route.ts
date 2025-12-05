import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithCredentials } from '@/lib/api-helpers';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/account/holdings
 * 보유 종목 조회
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // 인증 및 자격증명 확인 (KIS 클라이언트 자동 생성)
    const authResult = await requireAuthWithCredentials();
    if (!authResult.success) {
      return authResult.response;
    }

    const { kisClient } = authResult;

    // 미국 시장과 한국 시장 보유 종목을 병렬로 조회
    const [usHoldings, krHoldings] = await Promise.allSettled([
      kisClient.getAccountHoldings(),
      kisClient.getDomesticHoldings(),
    ]);

    // 성공한 데이터만 반환
    const holdings = {
      us: usHoldings.status === 'fulfilled' ? usHoldings.value : [],
      kr: krHoldings.status === 'fulfilled' ? krHoldings.value : [],
    };

    return api.success(holdings);
  } catch (error) {
    console.error('GET /api/account/holdings error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch holdings';
    return api.error(errorMessage, 500);
  }
}
