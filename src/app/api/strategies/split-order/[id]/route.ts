import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { strategies, credentials } from '@/lib/db/schema';
import { splitOrderStrategySchema } from '@/lib/validations/strategy';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/auth';
import { SplitOrderParams } from '@/types/strategy';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { executeStrategyImmediately } from '@/lib/strategies/executor';
import { lookupSymbolExchange } from '@/lib/services/symbol-lookup';
import { isSplitOrderParams, isValidExchangeCode } from '@/lib/utils/type-guards';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const strategyId = params.id;

    const json = await req.json();
    const body = splitOrderStrategySchema.parse(json);

    // Verify the strategy exists and belongs to the user
    const [existingStrategy] = await db
      .select()
      .from(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, userId)));

    if (!existingStrategy) {
      return NextResponse.json(
        { success: false, error: 'Strategy not found or you do not have permission' },
        { status: 404 }
      );
    }

    // Preserve existing runtime state (평단가 추적)
    // 타입 가드로 기존 파라미터 검증
    const existingParams = isSplitOrderParams(existingStrategy.parameters)
      ? existingStrategy.parameters
      : null;

    // US_DAYTIME은 DB에 US로 저장
    const dbMarket = body.market === 'US_DAYTIME' ? 'US' : body.market;

    // 거래소 코드 결정
    // 1. 종목이 변경되지 않았고 기존 exchangeCode가 있으면 재사용
    // 2. 종목이 변경되었거나 exchangeCode가 없으면 새로 조회
    const rawExchangeCode = existingParams?.exchangeCode;
    let exchangeCode: 'NASD' | 'NYSE' | 'AMEX' = isValidExchangeCode(rawExchangeCode) ? rawExchangeCode : 'NASD';

    // 종목이 변경된 경우에만 거래소 코드 재조회
    if (dbMarket === 'US' && body.symbol.toUpperCase() !== existingStrategy.symbol.toUpperCase()) {
      const userCredentials = await db.query.credentials.findFirst({
        where: eq(credentials.userId, userId),
      });

      if (userCredentials) {
        const decryptedCreds = getDecryptedCredentials(userCredentials);
        const kisClient = new KISClient({
          appkey: decryptedCreds.appKey,
          appsecret: decryptedCreds.appSecret,
          isMock: decryptedCreds.isMock,
          accountNumber: decryptedCreds.accountNumber,
        });

        const symbolLookup = await lookupSymbolExchange(body.symbol, 'US', kisClient);
        if (symbolLookup) {
          exchangeCode = symbolLookup.exchangeCode as 'NASD' | 'NYSE' | 'AMEX';
        } else {
          return NextResponse.json({
            success: false,
            error: `${body.symbol} 종목을 찾을 수 없습니다. 종목명을 확인해주세요.`
          }, { status: 400 });
        }
      }
    }
    // 종목이 같은데 exchangeCode가 없는 경우도 조회 (기존 전략 호환)
    else if (dbMarket === 'US' && !existingParams?.exchangeCode) {
      const userCredentials = await db.query.credentials.findFirst({
        where: eq(credentials.userId, userId),
      });

      if (userCredentials) {
        const decryptedCreds = getDecryptedCredentials(userCredentials);
        const kisClient = new KISClient({
          appkey: decryptedCreds.appKey,
          appsecret: decryptedCreds.appSecret,
          isMock: decryptedCreds.isMock,
          accountNumber: decryptedCreds.accountNumber,
        });

        const symbolLookup = await lookupSymbolExchange(body.symbol, 'US', kisClient);
        if (symbolLookup) {
          exchangeCode = symbolLookup.exchangeCode as 'NASD' | 'NYSE' | 'AMEX';
        }
        // 조회 실패 시에도 기본값(NASD) 사용하여 계속 진행
      }
    }

    // Form 데이터를 SplitOrderParams 형식으로 변환
    const parameters: SplitOrderParams = {
      basePrice: body.basePrice,
      totalAmount: body.totalQuantity,
      splitCount: body.orderCount,
      side: body.orderType.toUpperCase() as 'BUY' | 'SELL',
      declineValue: body.priceChange,
      declineUnit: body.priceChangeType === 'PERCENT' ? 'PERCENT' : 'USD',
      distributionType: body.distribution === 'TRIANGULAR'
        ? 'PYRAMID'
        : body.distribution === 'INVERTED_TRIANGULAR'
        ? 'INVERTED'
        : 'EQUAL',
      targetReturnRate: body.targetReturnRate,
      // Preserve existing runtime state
      currentAvgCost: existingParams?.currentAvgCost ?? 0,
      currentQty: existingParams?.currentQty ?? 0,
      // 주간매매 플래그 저장
      isDaytime: body.market === 'US_DAYTIME',
      // 거래소 코드 저장 (자동 조회 결과)
      exchangeCode,
    };

    const [updatedStrategy] = await db
      .update(strategies)
      .set({
        name: '분할매매',
        symbol: body.symbol,
        market: dbMarket,
        parameters,
        updatedAt: new Date(),
      })
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, userId)))
      .returning();

    // 전략 수정 후 즉시 실행 (ACTIVE 상태인 경우에만)
    if (updatedStrategy.status === 'ACTIVE') {
      const userCredentials = await db.query.credentials.findFirst({
        where: eq(credentials.userId, userId),
      });

      if (userCredentials) {
        const decryptedCreds = getDecryptedCredentials(userCredentials);
        const kisClient = new KISClient({
          appkey: decryptedCreds.appKey,
          appsecret: decryptedCreds.appSecret,
          isMock: decryptedCreds.isMock,
          accountNumber: decryptedCreds.accountNumber,
        });

        const executionResult = await executeStrategyImmediately(updatedStrategy, kisClient);

        return NextResponse.json({
          success: true,
          data: updatedStrategy,
          execution: executionResult,
        }, { status: 200 });
      }
    }

    return NextResponse.json({ success: true, data: updatedStrategy }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors }, { status: 400 });
    }
    console.error('Error updating split-order strategy:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
