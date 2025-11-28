
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { strategies, stockSymbols } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { api } from '@/lib/api';
import { getPopularStockName } from '@/lib/services/stock-name-lookup';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  try {
    const userStrategies = await db
      .select()
      .from(strategies)
      .where(eq(strategies.userId, session.user.id));

    // 각 전략에 종목명 추가
    const strategiesWithNames = await Promise.all(
      userStrategies.map(async (strategy) => {
        // 1. DB에서 종목명 조회
        const symbolInfo = await db.query.stockSymbols.findFirst({
          where: and(
            eq(stockSymbols.symbol, strategy.symbol.toUpperCase()),
            eq(stockSymbols.market, strategy.market)
          ),
        });

        let symbolName = symbolInfo?.name || null;

        // 2. DB에 종목명이 없으면 캐시된 인기 종목에서 조회 (시장 구분)
        if (!symbolName) {
          symbolName = getPopularStockName(strategy.symbol, strategy.market as 'US' | 'KR');

          // 인기 종목에서 찾았으면 DB에 업데이트
          if (symbolName && symbolInfo) {
            await db
              .update(stockSymbols)
              .set({ name: symbolName, updatedAt: new Date() })
              .where(eq(stockSymbols.id, symbolInfo.id));
          } else if (symbolName && !symbolInfo) {
            // DB에 없으면 새로 생성 (거래소 코드는 추후 검증 시 업데이트됨)
            await db.insert(stockSymbols).values({
              symbol: strategy.market === 'KR'
                ? strategy.symbol.padStart(6, '0')  // 한국: 6자리 패딩
                : strategy.symbol.toUpperCase(),    // 미국: 대문자
              market: strategy.market,
              exchangeCode: strategy.market === 'KR' ? 'KRX' : 'NASD', // 기본값
              name: symbolName,
              isActive: true,
              lastVerified: new Date(),
            }).onConflictDoNothing();
          }
        }

        return {
          ...strategy,
          symbolName,
        };
      })
    );

    return api.success(strategiesWithNames);
  } catch (error) {
    console.error('Error fetching strategies:', error);
    return api.error('Failed to fetch strategies', 500);
  }
}
