import { Order } from '@/types/order';
import { PortfolioMetrics, StrategyMetrics, PerformanceMetric } from '@/types/performance';
import { KISHolding } from '@/lib/kis/types';

// This is a placeholder. In a real scenario, you'd fetch this from a live API.
type PriceData = {
  [symbol: string]: number;
};

/**
 * Calculates realized PnL for a set of orders using the FIFO method.
 * @param orders - A list of filled orders, which will be sorted chronologically.
 * @returns The total realized profit or loss.
 */
function calculateRealizedPnlFIFO(orders: Order[]): number {
  let realizedPnl = 0;
  const fifoQueue: { qty: number, price: number }[] = [];

  const sortedOrders = [...orders]
    .filter(o => o.status === 'FILLED' && o.filledAt && o.filledQuantity && o.avgPrice)
    .sort((a, b) => new Date(a.filledAt!).getTime() - new Date(b.filledAt!).getTime());

  for (const order of sortedOrders) {
    const quantity = order.filledQuantity!;
    const price = parseFloat(order.avgPrice!);

    if (order.side === 'BUY') {
      fifoQueue.push({ qty: quantity, price: price });
    } else { // SELL
      let sellQty = quantity;
      while (sellQty > 0 && fifoQueue.length > 0) {
        const buyLot = fifoQueue[0];
        const qtyToSell = Math.min(sellQty, buyLot.qty);

        realizedPnl += (price - buyLot.price) * qtyToSell;

        buyLot.qty -= qtyToSell;
        sellQty -= qtyToSell;

        if (buyLot.qty === 0) {
          fifoQueue.shift();
        }
      }
      if (sellQty > 0) {
        // This implies selling more than was bought, i.e., a short sale.
        // This system doesn't support shorting, so we can log a warning.
        console.warn(`Warning: Sold ${sellQty} more shares than available in FIFO queue for symbol ${order.symbol}.`);
      }
    }
  }
  return realizedPnl;
}


export function calculateOverallMetrics(
  orders: Order[],
  cashBalance: number,
  kisHoldings: KISHolding[],
  prices: PriceData
): PortfolioMetrics {
  // Group orders by symbol for realized PnL calculation
  const ordersBySymbol: { [symbol:string]: Order[] } = {};
  for (const order of orders) {
    if (!ordersBySymbol[order.symbol]) {
      ordersBySymbol[order.symbol] = [];
    }
    ordersBySymbol[order.symbol].push(order);
  }

  let totalRealizedPnl = 0;
  for (const symbol in ordersBySymbol) {
    totalRealizedPnl += calculateRealizedPnlFIFO(ordersBySymbol[symbol]);
  }

  let unrealizedPnl = 0;
  let totalStockValue = 0;
  let totalInvested = 0; // Cost basis of current holdings
  const missingPriceSymbols: string[] = [];

  for (const holding of kisHoldings) {
    const symbol = holding.symbol;
    const currentPrice = prices[symbol];
    const avgPrice = holding.averagePrice;
    const quantity = holding.quantity;

    if (quantity > 0) {
      // P0: 가격이 없거나 0이면 평단가를 현재가로 사용 (fallback)
      if (currentPrice === undefined || currentPrice === 0) {
        missingPriceSymbols.push(symbol);
        // fallback: 평단가를 현재가로 사용하여 unrealizedPnl = 0으로 처리
        totalStockValue += avgPrice * quantity;
        totalInvested += avgPrice * quantity;
        // unrealizedPnl += 0 (변동 없음으로 처리)
      } else {
        unrealizedPnl += (currentPrice - avgPrice) * quantity;
        totalStockValue += currentPrice * quantity;
        totalInvested += avgPrice * quantity;
      }
    }
  }

  // 가격 조회 실패 심볼 로그
  if (missingPriceSymbols.length > 0) {
    console.warn(`[Performance] 가격 조회 실패 (평단가로 대체): ${missingPriceSymbols.join(', ')}`);
  }

  const totalValue = cashBalance + totalStockValue;
  const returnRate = totalInvested > 0 ? ((totalRealizedPnl + unrealizedPnl) / totalInvested) * 100 : 0;

  return {
    totalValue,
    totalInvested,
    realizedPnl: totalRealizedPnl,
    unrealizedPnl,
    returnRate,
    tradeCount: orders.filter(o => o.status === 'FILLED').length,
    cashBalance,
  };
}

export function calculateStrategyMetrics(
  orders: Order[],
  prices: PriceData,
  strategyName: string,
  strategyHoldings: KISHolding[]
): Omit<StrategyMetrics, 'strategyId'> {
  const realizedPnl = calculateRealizedPnlFIFO(orders);

  let unrealizedPnl = 0;
  let totalStockValue = 0;
  let totalInvested = 0;
  const missingPriceSymbols: string[] = [];

  for (const holding of strategyHoldings) {
    const symbol = holding.symbol;
    const currentPrice = prices[symbol];
    const avgPrice = holding.averagePrice;
    const quantity = holding.quantity;

    if (quantity > 0) {
      // P0: 가격이 없거나 0이면 평단가를 현재가로 사용 (fallback)
      if (currentPrice === undefined || currentPrice === 0) {
        missingPriceSymbols.push(symbol);
        totalStockValue += avgPrice * quantity;
        totalInvested += avgPrice * quantity;
      } else {
        unrealizedPnl += (currentPrice - avgPrice) * quantity;
        totalStockValue += currentPrice * quantity;
        totalInvested += avgPrice * quantity;
      }
    }
  }

  if (missingPriceSymbols.length > 0) {
    console.warn(`[Performance][${strategyName}] 가격 조회 실패 (평단가로 대체): ${missingPriceSymbols.join(', ')}`);
  }

  const totalValue = totalStockValue;
  const returnRate = totalInvested > 0 ? ((realizedPnl + unrealizedPnl) / totalInvested) * 100 : 0;

  return {
    totalValue,
    totalInvested,
    realizedPnl,
    unrealizedPnl,
    returnRate,
    tradeCount: orders.filter(o => o.status === 'FILLED').length,
    cashBalance: 0,
    strategyName,
  };
}


// --- New function for Cron Job ---

interface DailyMetricsData {
  strategyOrders: Order[];      // All filled orders for the strategy up to the given date
  strategyHoldings: KISHolding[]; // Current holdings for the strategy's symbol at the end of the date
  closingPrice: number;         // Closing price for the strategy's symbol on the given date
}

/**
 * Calculates daily performance metrics for a single strategy, intended for cron job collection.
 * This is a pure function that operates on provided data.
 */
export function calculateDailyStrategyMetrics(data: DailyMetricsData): Omit<PerformanceMetric, 'id' | 'userId' | 'strategyId' | 'date' | 'createdAt'> {
    const { strategyOrders, strategyHoldings, closingPrice } = data;

    // 1. Calculate Realized PnL from all filled orders for the strategy
    const realizedPnl = calculateRealizedPnlFIFO(strategyOrders);

    // 2. Calculate Unrealized PnL, Total Invested, and Total Value from current holdings
    let unrealizedPnl = 0;
    let totalInvested = 0; // Cost basis of current holdings
    let totalValue = 0;    // Market value of current holdings

    for (const holding of strategyHoldings) {
        const avgPrice = holding.averagePrice;
        const quantity = holding.quantity;

        if (quantity > 0) {
            unrealizedPnl += (closingPrice - avgPrice) * quantity;
            totalInvested += avgPrice * quantity;
            totalValue += closingPrice * quantity;
        }
    }
    
    // 3. Calculate Return Rate
    // The return rate is based on the capital currently invested in holdings.
    const returnRate = totalInvested > 0 ? ((realizedPnl + unrealizedPnl) / totalInvested) * 100 : 0;

    // 4. Trade Count
    const tradeCount = strategyOrders.length;

    return {
        totalInvested: totalInvested.toString(),
        totalValue: totalValue.toString(),
        realizedPnl: realizedPnl.toString(),
        unrealizedPnl: unrealizedPnl.toString(),
        returnRate: returnRate.toString(),
        tradeCount: tradeCount,
    };
}
