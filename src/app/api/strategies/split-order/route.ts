import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { strategies, credentials } from '@/lib/db/schema';
import { splitOrderStrategySchema } from '@/lib/validations/strategy';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { executeStrategyImmediately } from '@/lib/strategies/executor';
import { lookupSymbolExchange } from '@/lib/services/symbol-lookup';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if user has credentials
    const userCredentials = await db.query.credentials.findFirst({
        where: eq(credentials.userId, userId),
    });

    if (!userCredentials) {
        return NextResponse.json(
            { success: false, error: 'API credentials not found. Please register them first.' },
            { status: 403 }
        );
    }

    const json = await req.json();
    const body = splitOrderStrategySchema.parse(json);

    // US_DAYTIME은 DB에 US로 저장 (실행 시 주간매매 API 사용)
    const dbMarket = body.market === 'US_DAYTIME' ? 'US' : body.market;

    // KIS 클라이언트 초기화 (거래소 코드 조회용)
    const decryptedCreds = getDecryptedCredentials(userCredentials);
    const kisClient = new KISClient({
      appkey: decryptedCreds.appKey,
      appsecret: decryptedCreds.appSecret,
      isMock: decryptedCreds.isMock,
      accountNumber: decryptedCreds.accountNumber,
      credentialsId: decryptedCreds.credentialsId,
    });

    // 해외주식인 경우 거래소 코드 조회 (DB 캐시 → API 폴백)
    let exchangeCode: 'NASD' | 'NYSE' | 'AMEX' = 'NASD'; // 기본값
    if (dbMarket === 'US') {
      const symbolLookup = await lookupSymbolExchange(body.symbol, 'US', kisClient);
      if (symbolLookup) {
        exchangeCode = symbolLookup.exchangeCode as 'NASD' | 'NYSE' | 'AMEX';
      } else {
        // 모든 거래소에서 실패 시 에러 반환
        return NextResponse.json({
          success: false,
          error: `${body.symbol} 종목을 찾을 수 없습니다. 종목명을 확인해주세요.`
        }, { status: 400 });
      }
    }

    // Form 데이터를 SplitOrderParams 형식으로 변환
    const parameters = {
      basePrice: body.basePrice,
      totalAmount: body.totalQuantity,
      splitCount: body.orderCount,
      side: body.orderType.toUpperCase() as 'BUY' | 'SELL',
      declineValue: body.priceChange,
      declineUnit: body.priceChangeType === 'PERCENT' ? 'PERCENT' : 'USD' as 'PERCENT' | 'USD',
      distributionType: body.distribution === 'TRIANGULAR'
        ? 'PYRAMID'
        : body.distribution === 'INVERTED_TRIANGULAR'
        ? 'INVERTED'
        : 'EQUAL' as 'PYRAMID' | 'EQUAL' | 'INVERTED',
      targetReturnRate: body.targetReturnRate,
      currentAvgCost: 0,
      currentQty: 0,
      // 주간매매 플래그 저장
      isDaytime: body.market === 'US_DAYTIME',
      // 거래소 코드 저장 (자동 조회 결과)
      exchangeCode,
    };

    const [newStrategy] = await db
      .insert(strategies)
      .values({
        userId,
        name: '분할매매',
        type: 'SPLIT_ORDER',
        status: 'ACTIVE',
        symbol: body.symbol,
        market: dbMarket,
        parameters,
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
