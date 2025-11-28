import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { stockSymbols } from '@/lib/db/schema';
import { or, ilike, eq, and } from 'drizzle-orm';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/symbols/search?q=AAPL&market=US
 * 종목 검색 API (자동완성용)
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get('q');
  const market = searchParams.get('market') as 'US' | 'KR' | null;

  if (!query || query.length < 1) {
    return api.success([]);
  }

  try {
    const whereConditions = [
      or(
        ilike(stockSymbols.symbol, `%${query}%`),
        ilike(stockSymbols.name, `%${query}%`)
      ),
    ];

    if (market) {
      whereConditions.push(eq(stockSymbols.market, market));
    }

    const results = await db
      .select()
      .from(stockSymbols)
      .where(and(...whereConditions))
      .limit(10)
      .orderBy(stockSymbols.symbol);

    return api.success(results);
  } catch (error) {
    console.error('Symbol search error:', error);
    return api.error('Failed to search symbols', 500);
  }
}
