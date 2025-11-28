
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { orders, credentials, stockSymbols } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { KISClient } from '@/lib/kis/client';
import { calculateOverallMetrics } from '@/lib/performance/calculator';
import { decrypt } from '@/lib/crypto/encryption';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    // 1. Fetch user credentials
    const userCredentials = await db.query.credentials.findFirst({
      where: eq(credentials.userId, userId),
    });

    if (!userCredentials) {
      return NextResponse.json({ success: false, error: 'KIS credentials not found.' }, { status: 400 });
    }

    if (!userCredentials.appKeyEncrypted || !userCredentials.appSecretEncrypted || !userCredentials.accountNumberEncrypted) {
      return NextResponse.json({ error: 'KIS credentials are incomplete.' }, { status: 400 });
    }

    // 2. Decrypt credentials and instantiate KISClient
    const appkey = decrypt(userCredentials.appKeyEncrypted);
    const appsecret = decrypt(userCredentials.appSecretEncrypted);
    const accountNumber = decrypt(userCredentials.accountNumberEncrypted);

    const kisClient = new KISClient({
      appkey,
      appsecret,
      accountNumber,
      isMock: userCredentials.isMock ?? true,
      credentialsId: userCredentials.id,
    });

    // 3. Fetch account info (cash balance and holdings)
    const accountInfo = await kisClient.getAccountInfo();
    const cashBalance = accountInfo.cashAmount ?? 0;
    const kisHoldings = accountInfo.holdings ?? [];

    // 4. Fetch all filled orders for the user
    const filledOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.userId, userId),
        eq(orders.status, 'FILLED')
      ),
    });

    // 5. Get unique symbols from both filled orders and current holdings
    const uniqueSymbols = new Set<string>();
    filledOrders.forEach(o => uniqueSymbols.add(o.symbol));
    kisHoldings.forEach(h => uniqueSymbols.add(h.symbol));

    // 5-1. stockSymbols 테이블에서 exchange 코드 조회
    const symbolsList = Array.from(uniqueSymbols);
    const symbolExchangeMap: Record<string, string> = {};

    if (symbolsList.length > 0) {
      const symbolRecords = await db.query.stockSymbols.findMany({
        where: inArray(stockSymbols.symbol, symbolsList),
      });

      for (const record of symbolRecords) {
        symbolExchangeMap[record.symbol] = record.exchangeCode;
      }
    }

    // DB의 exchange 코드 (4자리) → API용 코드 (3자리) 변환
    const exchangeCodeToExcd: Record<string, string> = {
      'NASD': 'NAS',
      'NYSE': 'NYS',
      'AMEX': 'AMS',
    };

    // exchange 코드가 없는 심볼 확인 및 로그
    const missingExchangeSymbols = symbolsList.filter(s => !symbolExchangeMap[s]);
    if (missingExchangeSymbols.length > 0) {
      console.warn(`[Performance] stockSymbols 테이블에 없는 종목 (기본값 NAS 사용): ${missingExchangeSymbols.join(', ')}`);
    }

    // exchange 코드를 API용 3자리 코드로 변환
    const symbolsToFetch = symbolsList.map(symbol => {
      const dbExchangeCode = symbolExchangeMap[symbol];
      const apiExchangeCode = dbExchangeCode
        ? (exchangeCodeToExcd[dbExchangeCode] || 'NAS')
        : 'NAS';
      return { symbol, exchange: apiExchangeCode };
    });

    // 6. Fetch current prices for all relevant symbols
    const prices = await kisClient.getCurrentPrices(symbolsToFetch);
    console.log(`[Performance] 가격 조회 결과:`, prices);

    // 7. Calculate metrics
    const metrics = calculateOverallMetrics(filledOrders, cashBalance, kisHoldings, prices);

    // 8. Return data
    return NextResponse.json({ success: true, data: metrics });

  } catch (error) {
    console.error('GET /api/performance/summary error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
