import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { db } from '@/lib/db/client';
import { lookupSymbolExchange } from '@/lib/services/symbol-lookup';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

/**
 * Symbol validation endpoint
 * GET /api/validate-symbol?symbol=IONQ&market=US
 *
 * Returns:
 * {
 *   success: true,
 *   data: {
 *     symbol: "IONQ",
 *     market: "US",
 *     exchangeCode: "NYSE",
 *     isActive: true,
 *     cached: false
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 파라미터 추출
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const market = (searchParams.get('market') || 'US') as 'US' | 'KR';

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }

    // 사용자 credentials 조회
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
      with: { credentials: true },
    });

    if (!user?.credentials?.[0]) {
      return NextResponse.json(
        { error: 'No credentials found. Please configure your KIS API credentials.' },
        { status: 400 }
      );
    }

    // KIS Client 생성
    const decryptedCredentials = getDecryptedCredentials(user.credentials[0]);
    const kisClient = new KISClient({
      appkey: decryptedCredentials.appKey,
      appsecret: decryptedCredentials.appSecret,
      isMock: decryptedCredentials.isMock,
      accountNumber: decryptedCredentials.accountNumber,
    });

    // 심볼 조회
    const result = await lookupSymbolExchange(symbol, market, kisClient);

    if (!result) {
      return NextResponse.json(
        {
          error: 'Symbol not found',
          message: `Symbol "${symbol}" is not available on any supported exchange (NASDAQ, NYSE, AMEX).`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Symbol validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to validate symbol', details: errorMessage },
      { status: 500 }
    );
  }
}
