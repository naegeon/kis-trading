import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { strategies, credentials } from '@/lib/db/schema';
import { looLocStrategySchema } from '@/lib/validations/strategy';
import { auth } from '@/auth';
import { eq } from 'drizzle-orm';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { KISClient } from '@/lib/kis/client';
import { executeStrategyImmediately } from '@/lib/strategies/executor';
import { lookupSymbolExchange } from '@/lib/services/symbol-lookup';
import { log } from '@/lib/logger';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const userCredentials = await db.query.credentials.findFirst({
        where: eq(credentials.userId, userId),
    });

    if (!userCredentials) {
        return NextResponse.json(
            { success: false, error: 'API credentials not found. Please register them first.' },
            { status: 403 }
        );
    }

    // LOO/LOC 전략 제약 조건 검증 (Phase 2 - Task 2.1)
    // 1. 실거래 계좌만 가능 (모의투자 계좌 차단)
    const decryptedCreds = getDecryptedCredentials({
      appKeyEncrypted: userCredentials.appKeyEncrypted,
      appSecretEncrypted: userCredentials.appSecretEncrypted,
      accountNumberEncrypted: userCredentials.accountNumberEncrypted,
      isMock: userCredentials.isMock,
    });

    if (decryptedCreds.isMock) {
      return NextResponse.json(
        {
          success: false,
          error: 'LOO/LOC 전략은 실거래 계좌에서만 사용 가능합니다. 설정에서 실거래 API 키를 등록해주세요.',
        },
        { status: 400 }
      );
    }

    const json = await req.json();
    const body = looLocStrategySchema.parse(json);

    // 2. 미국 시장만 가능 (한국 시장 차단)
    // LOO/LOC는 항상 US 시장이지만, 향후 확장을 위해 검증 추가
    // 현재 스키마에서는 market 필드가 없으므로, 주석으로만 남김
    // if (body.market && body.market !== 'US') {
    //   return NextResponse.json(
    //     { success: false, error: 'LOO/LOC 전략은 미국 시장에서만 사용 가능합니다.' },
    //     { status: 400 }
    //   );
    // }

    // KIS 클라이언트 초기화 (거래소 코드 조회용)
    const kisClient = new KISClient({
      appkey: decryptedCreds.appKey,
      appsecret: decryptedCreds.appSecret,
      isMock: decryptedCreds.isMock,
      accountNumber: decryptedCreds.accountNumber,
      credentialsId: decryptedCreds.credentialsId,
    });

    // 거래소 코드 조회 (DB 캐시 → API 폴백)
    let exchangeCode: 'NASD' | 'NYSE' | 'AMEX' = 'NASD'; // 기본값
    try {
      const symbolLookup = await lookupSymbolExchange(body.symbol, 'US', kisClient);
      if (symbolLookup) {
        exchangeCode = symbolLookup.exchangeCode as 'NASD' | 'NYSE' | 'AMEX';
        // Exchange code found successfully
      }
      // Using default NASD if lookup fails
    } catch (error) {
      // Symbol lookup error, using default NASD
      await log('WARN', `Symbol lookup error for ${body.symbol}`, { error }, userId);
    }

    // 서버에서 자동으로 설정하는 필드들 추가
    // [DEPRECATED] isFirstExecution, currentAvgCost, currentQty - KIS API 보유 조회로 대체
    const parameters = {
      ...body,
      exchangeCode,            // 거래소 코드
    };

    // LOO/LOC는 미국 시장만 지원 (US_DAYTIME도 US로 저장)
    const dbMarket: 'US' | 'KR' = 'US';

    const [newStrategy] = await db
      .insert(strategies)
      .values({
        userId,
        name: '앞뒤로',
        type: 'LOO_LOC',
        status: 'ACTIVE',
        symbol: body.symbol,
        market: dbMarket,
        parameters,
        startDate: body.startDate, // Add this
        endDate: body.endDate,     // Add this
      })
      .returning();

    // 전략 생성 후 즉시 실행 (이미 초기화된 kisClient 사용)
    const executionResult = await executeStrategyImmediately(newStrategy, kisClient);

    return NextResponse.json({
      success: true,
      data: newStrategy,
      execution: executionResult,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
