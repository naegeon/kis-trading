import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { strategies as strategiesSchema, orders as ordersSchema, performanceMetrics, executionLogs } from '@/lib/db/schema';
import { and, eq, lte, isNotNull } from 'drizzle-orm';
import { KISClient } from '@/lib/kis/client';

import { decrypt } from '@/lib/crypto/encryption';
import { calculateDailyStrategyMetrics } from '@/lib/performance/calculator';
import { KISHolding } from '@/lib/kis/types';
import { Order } from '@/types/order';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

async function collectMetricsHandler(request: NextRequest) {
  // Vercel Cron Job Security (only for GET requests from Vercel Cron)
  const authHeader = request.headers.get('authorization');
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // For POST requests (manual execution), skip auth in development
  if (request.method === 'GET' && !isVercelCron) {
    await log('ERROR', 'Unauthorized cron job access attempt for collect-metrics.');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  await log('INFO', 'Starting daily performance metrics collection cron job.');

  try {
    const today = new Date();
    
    const allUsers = await db.query.users.findMany({
      with: {
        credentials: true,
        strategies: {
          where: eq(strategiesSchema.status, 'ACTIVE'),
        },
      },
    });

    for (const user of allUsers) {
      if (!user.credentials.length || user.strategies.length === 0) {
        await log('INFO', `Skipping user ${user.id}: No credentials or active strategies.`, {}, user.id);
        continue;
      }
      
      await log('INFO', `Processing user ${user.id}`, {}, user.id);

      // 2. Initialize KIS Client
      const cred = user.credentials[0]; // Assuming one credential per user
      const appKey = decrypt(cred.appKeyEncrypted);
      const appSecret = decrypt(cred.appSecretEncrypted);
      const accountNumber = decrypt(cred.accountNumberEncrypted);
      const isMock = cred.isMock ?? true;

      const kisClient = new KISClient({
        appkey: appKey,
        appsecret: appSecret,
        isMock: isMock,
        accountNumber: accountNumber,
      });

      const userHoldings = await kisClient.getAccountHoldings();
      const symbolsInHoldings = userHoldings.map(h => h.symbol);
      const symbolsInStrategies = user.strategies.map(s => s.symbol);
      const allSymbols = [...new Set([...symbolsInHoldings, ...symbolsInStrategies])];

      if (allSymbols.length === 0) {
        await log('INFO', `User ${user.id} has no symbols to process.`, {}, user.id);
        continue;
      }

      const prices: { [symbol: string]: number } = {};
      const pricePromises = allSymbols.map(symbol => kisClient.getStockPrice(symbol).then(priceInfo => {
prices[symbol] = parseFloat(priceInfo.stck_prpr); // stck_prpr is 'stock present price'
      }));
      await Promise.all(pricePromises);

      for (const strategy of user.strategies) {
        await log('INFO', `Processing strategy ${strategy.id} for user ${user.id}`, {}, user.id, strategy.id);
        
        const strategySymbol = strategy.symbol;
        const closingPrice = prices[strategySymbol];

        if (typeof closingPrice !== 'number') {
          await log('WARN', `Could not fetch price for ${strategySymbol}. Skipping metrics calculation.`, {}, user.id, strategy.id);
          continue;
        }

        const strategyOrders: Order[] = await db.select().from(ordersSchema).where(
          and(
            eq(ordersSchema.strategyId, strategy.id),
            eq(ordersSchema.status, 'FILLED'),
            isNotNull(ordersSchema.filledAt),
            lte(ordersSchema.filledAt, today)
          )
        );

        const strategyHoldings: KISHolding[] = userHoldings.filter(h => h.symbol === strategySymbol);

        const metrics = calculateDailyStrategyMetrics({
          strategyOrders,
          strategyHoldings,
          closingPrice,
        });

        await db.insert(performanceMetrics).values({
          userId: user.id,
          strategyId: strategy.id,
          date: today,
          ...metrics,
        }).onConflictDoUpdate({
          target: [performanceMetrics.userId, performanceMetrics.strategyId, performanceMetrics.date],
          set: { ...metrics }
        });
        await log('INFO', `Successfully saved metrics for strategy ${strategy.id}`, {}, user.id, strategy.id);
      }
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const deletedLogs = await db.delete(executionLogs).where(
        and(
            eq(executionLogs.logLevel, 'INFO'),
            lte(executionLogs.createdAt, thirtyDaysAgo)
        )
    );
    
    await log('INFO', `Cleaned up ${deletedLogs.rowCount} old INFO logs.`);
    await log('INFO', 'Finished daily performance metrics collection cron job.');

    return NextResponse.json({ success: true, message: 'Metrics collected and logs cleaned.' });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    await log('ERROR', 'Error in performance metrics cron job', { error: errorMessage });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// GET handler for Vercel Cron
export async function GET(request: NextRequest) {
  return collectMetricsHandler(request);
}

// POST handler for manual execution
export async function POST(request: NextRequest) {
  return collectMetricsHandler(request);
}