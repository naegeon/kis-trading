/**
 * KIS API Client Mock
 * 실제 API 호출 없이 테스트할 수 있도록 Mock 제공
 */

import { KISClient } from '@/lib/kis/client';

export interface MockKISConfig {
  // 현재가 정보
  stockPrice?: {
    currentPrice: number;
    previousClose: number;
    openingPrice: number;
  };
  // 보유 종목
  holdings?: Array<{
    symbol: string;
    quantity: number;
    averagePrice: number;
    currentPrice: number;
  }>;
  // 미체결 주문
  unfilledOrders?: Array<{
    orderId: string;
    symbol: string;
    orderType: string;
    side: string;
    quantity: number;
    price: number;
  }>;
  // 주문 상세 (체결 내역)
  orderDetails?: Record<string, {
    status: 'SUBMITTED' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'FAILED';
    filledQuantity: number;
    avgPrice: number;
  }>;
  // 예수금
  deposit?: {
    deposit: number;
    buyableCash: number;
  };
  // 주문 제출 결과
  submitOrderResult?: {
    success: boolean;
    orderId?: string;
    errorMessage?: string;
  };
}

export class MockKISClient {
  private config: MockKISConfig;
  public submitOrderCalls: Array<{
    symbol: string;
    side: string;
    orderType: string;
    quantity: number;
    price: number;
  }> = [];
  public cancelOrderCalls: Array<{ orderId: string }> = [];

  constructor(config: MockKISConfig = {}) {
    this.config = {
      stockPrice: { currentPrice: 100, previousClose: 100, openingPrice: 100 },
      holdings: [],
      unfilledOrders: [],
      orderDetails: {},
      deposit: { deposit: 10000, buyableCash: 10000 },
      submitOrderResult: { success: true, orderId: 'MOCK_ORDER_001' },
      ...config,
    };
  }

  updateConfig(config: Partial<MockKISConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // 시세 조회
  async getOverseasStockPriceDetail(symbol: string, exchangeCode: string) {
    return {
      currentPrice: this.config.stockPrice!.currentPrice,
      previousClose: this.config.stockPrice!.previousClose,
      openingPrice: this.config.stockPrice!.openingPrice,
      highPrice: this.config.stockPrice!.currentPrice + 5,
      lowPrice: this.config.stockPrice!.currentPrice - 5,
      volume: 1000000,
      change: this.config.stockPrice!.currentPrice - this.config.stockPrice!.previousClose,
      changeRate: ((this.config.stockPrice!.currentPrice - this.config.stockPrice!.previousClose) / this.config.stockPrice!.previousClose) * 100,
    };
  }

  async getStockPrice(symbol: string) {
    return {
      stck_prpr: this.config.stockPrice!.currentPrice.toString(),
    };
  }

  // 보유 종목 조회
  async getAccountHoldings() {
    return this.config.holdings!.map(h => ({
      symbol: h.symbol,
      name: `${h.symbol} Stock`,
      quantity: h.quantity,
      averagePrice: h.averagePrice,
      currentPrice: h.currentPrice,
      valuationPrice: h.quantity * h.currentPrice,
      profitRate: ((h.currentPrice - h.averagePrice) / h.averagePrice) * 100,
    }));
  }

  // 미체결 주문 조회
  async getOverseasUnfilledOrders() {
    return this.config.unfilledOrders!.map(o => ({
      orderId: o.orderId,
      symbol: o.symbol,
      orderType: o.orderType,
      side: o.side,
      quantity: o.quantity,
      price: o.price,
      status: 'SUBMITTED',
    }));
  }

  // 주문 상세 조회 (체결 내역)
  async getOrderDetail(orderId: string, symbol: string, market: string, exchangeCode?: string) {
    const detail = this.config.orderDetails![orderId];
    if (!detail) {
      // 주문을 찾을 수 없으면 CANCELLED 반환 (실제 동작과 동일)
      return {
        status: 'CANCELLED' as const,
        filledQuantity: 0,
        avgPrice: 0,
      };
    }
    return detail;
  }

  // 예수금 조회
  async getOverseasDeposit() {
    return this.config.deposit!;
  }

  async getDomesticAccountBalance() {
    return {
      domesticCurrency: {
        deposit: this.config.deposit!.deposit,
        buyableCash: this.config.deposit!.buyableCash,
      },
    };
  }

  // 주문 제출
  async submitOverseasOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: string;
    quantity: number;
    price: number;
    exchangeCode: string;
  }) {
    this.submitOrderCalls.push({
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      quantity: params.quantity,
      price: params.price,
    });

    if (!this.config.submitOrderResult!.success) {
      throw new Error(this.config.submitOrderResult!.errorMessage || 'Order submission failed');
    }

    // 주문 ID 자동 증가
    const orderId = this.config.submitOrderResult!.orderId ||
      `MOCK_ORDER_${String(this.submitOrderCalls.length).padStart(3, '0')}`;

    return { orderId };
  }

  // 주문 취소
  async cancelOverseasOrder(orderId: string, symbol: string) {
    this.cancelOrderCalls.push({ orderId });
    return { success: true };
  }

  // 테스트 헬퍼: 호출 기록 초기화
  resetCalls(): void {
    this.submitOrderCalls = [];
    this.cancelOrderCalls = [];
  }

  // 테스트 헬퍼: 주문 제출 횟수
  getSubmitOrderCount(): number {
    return this.submitOrderCalls.length;
  }
}

/**
 * KISClient를 MockKISClient로 대체하는 헬퍼
 */
export function createMockKISClient(config?: MockKISConfig): MockKISClient {
  return new MockKISClient(config);
}
