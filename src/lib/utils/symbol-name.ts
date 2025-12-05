import { db } from '@/lib/db/client';
import { stockSymbols } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * 종목 코드로 종목명을 조회합니다.
 * DB 캐시에서만 조회하며, 없으면 null 반환
 */
export async function getSymbolName(
  symbol: string,
  market: 'US' | 'KR'
): Promise<string | null> {
  try {
    const result = await db.query.stockSymbols.findFirst({
      where: and(
        eq(stockSymbols.symbol, symbol.toUpperCase()),
        eq(stockSymbols.market, market)
      ),
    });

    return result?.name || null;
  } catch (error) {
    console.error('Failed to get symbol name:', error);
    return null;
  }
}

/**
 * 종목 코드와 종목명을 함께 표시하는 문자열을 반환합니다.
 * 예: "AAPL (Apple Inc.)" 또는 "AAPL" (종목명이 없는 경우)
 */
export function formatSymbolWithName(symbol: string, name?: string | null): string {
  if (!name) return symbol;
  return `${symbol} (${name})`;
}
