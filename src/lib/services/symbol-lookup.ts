import { db } from '@/lib/db/client';
import { stockSymbols } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { KISClient } from '@/lib/kis/client';
import { getStockName } from './stock-name-lookup';

/**
 * Exchange code mapping for KIS API
 * NASD = NASDAQ
 * NYSE = New York Stock Exchange
 * AMEX = American Stock Exchange
 */
const EXCHANGE_CODES = ['NASD', 'NYSE', 'AMEX'] as const;
type ExchangeCode = typeof EXCHANGE_CODES[number];

// KIS API EXCD 매핑 (시세 조회 API에서 사용하는 거래소 코드)
// 주문 API(OVRS_EXCG_CD)와 시세 조회 API(EXCD)는 다른 형식 사용
const EXCD_MAPPING: Record<ExchangeCode, string> = {
  'NASD': 'NAS', // NASDAQ
  'NYSE': 'NYS', // NYSE
  'AMEX': 'AMS', // NYSE American (formerly AMEX)
};

interface SymbolLookupResult {
  symbol: string;
  market: 'US' | 'KR';
  exchangeCode: ExchangeCode;
  name?: string;
  isActive: boolean;
  cached: boolean; // DB에서 가져왔는지 여부
}

/**
 * 심볼의 거래소 코드를 조회합니다.
 * 1. DB 캐시 확인 (30일 이내)
 * 2. DB에 없으면 KIS API로 거래소 순차 검색
 * 3. 찾으면 DB에 저장
 */
export async function lookupSymbolExchange(
  symbol: string,
  market: 'US' | 'KR' = 'US',
  kisClient: KISClient
): Promise<SymbolLookupResult | null> {
  const symbolUpper = symbol.toUpperCase();

  // 한국 주식은 거래소 코드 불필요
  if (market === 'KR') {
    return {
      symbol: symbolUpper,
      market: 'KR',
      exchangeCode: 'NASD', // 더미 값 (사용 안 함)
      isActive: true,
      cached: false,
    };
  }

  // 1. DB 캐시 확인 (30일 이내)
  const cachedSymbol = await db.query.stockSymbols.findFirst({
    where: and(
      eq(stockSymbols.symbol, symbolUpper),
      eq(stockSymbols.market, market)
    ),
  });

  if (cachedSymbol && cachedSymbol.lastVerified) {
    // 30일 이내면 캐시 사용
    const daysSinceVerified = Math.floor(
      (Date.now() - new Date(cachedSymbol.lastVerified).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceVerified < 30) {
      return {
        symbol: cachedSymbol.symbol,
        market: cachedSymbol.market as 'US' | 'KR',
        exchangeCode: cachedSymbol.exchangeCode as ExchangeCode,
        name: cachedSymbol.name || undefined,
        isActive: cachedSymbol.isActive || true,
        cached: true,
      };
    }
  }

  // 2. KIS API로 거래소 순차 검색
  for (const exchangeCode of EXCHANGE_CODES) {
    try {
      const excd = EXCD_MAPPING[exchangeCode];
      // Trying symbol lookup on exchange

      const priceInfo = await kisClient.getOverseasStockPrice(symbolUpper, excd);

      // 성공하면 해당 거래소에서 거래 가능
      if (priceInfo && priceInfo.output && priceInfo.output.last) {
        // Symbol found on exchange

        // 종목명 조회
        const stockName = await getStockName(symbolUpper, exchangeCode);

        const result: SymbolLookupResult = {
          symbol: symbolUpper,
          market,
          exchangeCode,
          name: stockName || undefined,
          isActive: true,
          cached: false,
        };

        // 3. DB에 저장 (upsert)
        if (cachedSymbol) {
          // 업데이트
          await db
            .update(stockSymbols)
            .set({
              exchangeCode,
              name: stockName || cachedSymbol.name, // 기존 이름 유지 또는 새로 조회된 이름
              isActive: true,
              lastVerified: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(stockSymbols.id, cachedSymbol.id));
        } else {
          // 새로 생성
          await db.insert(stockSymbols).values({
            symbol: symbolUpper,
            market,
            exchangeCode,
            name: stockName,
            isActive: true,
            lastVerified: new Date(),
          });
        }

        return result;
      }
    } catch {
      // 이 거래소에서는 실패, 다음 거래소 시도
      continue;
    }
  }

  // 모든 거래소에서 실패
  return null;
}

/**
 * 여러 심볼을 한 번에 조회합니다.
 */
export async function lookupMultipleSymbols(
  symbols: string[],
  market: 'US' | 'KR' = 'US',
  kisClient: KISClient
): Promise<Map<string, SymbolLookupResult>> {
  const results = new Map<string, SymbolLookupResult>();

  for (const symbol of symbols) {
    try {
      const result = await lookupSymbolExchange(symbol, market, kisClient);
      if (result) {
        results.set(symbol.toUpperCase(), result);
      }
      // API rate limiting 방지
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch {
      // Failed to lookup symbol, continue with next
      continue;
    }
  }

  return results;
}
