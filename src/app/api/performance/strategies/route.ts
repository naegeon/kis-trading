
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { orders, strategies, credentials, stockSymbols } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { KISClient } from '@/lib/kis/client';
import { calculateStrategyMetrics } from '@/lib/performance/calculator';
import { decrypt } from '@/lib/crypto/encryption';
import { STRATEGY_TYPE_LABELS } from '@/lib/constants/strategy';

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

    // 3. Fetch account info (holdings)
    const accountInfo = await kisClient.getAccountInfo();
    const kisHoldings = accountInfo.holdings ?? [];

    // 4. Fetch all strategies and filled orders
    const userStrategies = await db.query.strategies.findMany({
      where: eq(strategies.userId, userId),
    });

    const filledOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.userId, userId),
        eq(orders.status, 'FILLED')
      ),
    });

    // 5. Get unique symbols from both filled orders, current holdings, and strategies
    const uniqueSymbols = new Set<string>();
    filledOrders.forEach(o => uniqueSymbols.add(o.symbol));
    kisHoldings.forEach(h => uniqueSymbols.add(h.symbol));
    userStrategies.forEach(s => uniqueSymbols.add(s.symbol));

    // 5-1. stockSymbols 테이블에서 exchange 코드와 종목명 조회
    const symbolsList = Array.from(uniqueSymbols);
    const symbolExchangeMap: Record<string, string> = {};
    const symbolNameMap: Record<string, string> = {};

    if (symbolsList.length > 0) {
      const symbolRecords = await db.query.stockSymbols.findMany({
        where: inArray(stockSymbols.symbol, symbolsList),
      });

      for (const record of symbolRecords) {
        symbolExchangeMap[record.symbol] = record.exchangeCode;
        if (record.name) {
          symbolNameMap[record.symbol] = record.name;
        }
      }
    }

    // DB의 exchange 코드 (4자리) → API용 코드 (3자리) 변환
    const exchangeCodeToExcd: Record<string, string> = {
      'NASD': 'NAS',
      'NYSE': 'NYS',
      'AMEX': 'AMS',
    };

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

    // 7. Calculate metrics for each strategy (전략 symbol 기반으로 holdings 매핑 개선)
    const performanceData = userStrategies.map(strategy => {
      const strategyOrders = filledOrders.filter(o => o.strategyId === strategy.id);
      // P1: 전략의 symbol로 직접 holdings 매핑 (주문 없어도 holdings 표시)
      const strategyHoldings = kisHoldings.filter(h => h.symbol === strategy.symbol);

      // 전략명: "전략타입 / 종목코드" 형식으로 생성
      const strategyTypeLabel = STRATEGY_TYPE_LABELS[strategy.type] || strategy.type;
      const displayName = `${strategyTypeLabel} / ${strategy.symbol}`;

      if (strategyOrders.length === 0 && strategyHoldings.length === 0) {
        return {
          strategyId: strategy.id,
          strategyName: displayName,
          symbol: strategy.symbol,
          symbolName: symbolNameMap[strategy.symbol] || null,
          totalValue: 0,
          totalInvested: 0,
          realizedPnl: 0,
          unrealizedPnl: 0,
          returnRate: 0,
          tradeCount: 0,
          cashBalance: 0,
        };
      }

      const metrics = calculateStrategyMetrics(strategyOrders, prices, displayName, strategyHoldings);

      return {
        ...metrics,
        strategyId: strategy.id,
        symbol: strategy.symbol,
        symbolName: symbolNameMap[strategy.symbol] || null,
      };
    });

    return NextResponse.json({ success: true, data: performanceData });

  } catch (error) {
    console.error('GET /api/performance/strategies error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
