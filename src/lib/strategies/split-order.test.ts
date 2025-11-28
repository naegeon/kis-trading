// Mock 설정 (split-order.ts의 의존성 해결)
jest.mock('@/lib/db/client', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  },
}));

jest.mock('@/lib/logger', () => ({
  log: jest.fn(),
}));

jest.mock('@/lib/push/notification', () => ({
  sendPushNotification: jest.fn(),
}));

import {
  calculatePyramidDistribution,
  calculateEqualDistribution,
  calculateInvertedDistribution,
  calculateSplitPrices,
} from './split-order';

describe('분할주문 계산 로직 테스트', () => {
  describe('수량 분배 함수', () => {
    it('삼각형(Pyramid) 분배를 정확히 계산해야 한다', () => {
      // 총 15주, 5회 분할 -> [1, 2, 3, 4, 5]
      expect(calculatePyramidDistribution(15, 5)).toEqual([1, 2, 3, 4, 5]);
      // 총 10주, 4회 분할 -> [1, 2, 3, 4]
      expect(calculatePyramidDistribution(10, 4)).toEqual([1, 2, 3, 4]);
      // 나누어 떨어지지 않는 경우
      expect(calculatePyramidDistribution(10, 3)).toEqual([2, 3, 5]); // 1.66, 3.33, 5 -> 2, 3, 5
    });

    it('균등(Equal) 분배를 정확히 계산해야 한다', () => {
      expect(calculateEqualDistribution(10, 5)).toEqual([2, 2, 2, 2, 2]);
      expect(calculateEqualDistribution(10, 3)).toEqual([4, 3, 3]);
      expect(calculateEqualDistribution(7, 3)).toEqual([3, 2, 2]);
    });

    it('역삼각형(Inverted) 분배를 정확히 계산해야 한다', () => {
      expect(calculateInvertedDistribution(15, 5)).toEqual([5, 4, 3, 2, 1]);
      expect(calculateInvertedDistribution(10, 4)).toEqual([4, 3, 2, 1]);
      expect(calculateInvertedDistribution(10, 3)).toEqual([5, 3, 2]);
    });

    it('엣지 케이스를 처리해야 한다', () => {
      expect(calculatePyramidDistribution(100, 1)).toEqual([100]);
      expect(calculateEqualDistribution(100, 1)).toEqual([100]);
      expect(calculateInvertedDistribution(100, 1)).toEqual([100]);
      expect(calculatePyramidDistribution(100, 0)).toEqual([]);
    });
  });

  describe('가격 계산 함수', () => {
    it('USD 기준으로 매수 가격을 정확히 계산해야 한다', () => {
      // 기준가 100, 10달러씩 하락, 5회
      const prices = calculateSplitPrices(100, 10, 'USD', 5, 'BUY');
      expect(prices).toEqual([100, 90, 80, 70, 60]);
    });

    it('PERCENT 기준으로 매수 가격을 정확히 계산해야 한다', () => {
      // 기준가 100, 10%씩 하락, 4회
      const prices = calculateSplitPrices(100, 10, 'PERCENT', 4, 'BUY');
      expect(prices).toEqual([100, 90, 81, 72.9]);
    });

    it('USD 기준으로 매도 가격을 정확히 계산해야 한다', () => {
      // 기준가 100, 10달러씩 상승, 5회
      const prices = calculateSplitPrices(100, 10, 'USD', 5, 'SELL');
      expect(prices).toEqual([100, 110, 120, 130, 140]);
    });

    it('PERCENT 기준으로 매도 가격을 정확히 계산해야 한다', () => {
      // 기준가 100, 10%씩 상승, 4회
      const prices = calculateSplitPrices(100, 10, 'PERCENT', 4, 'SELL');
      expect(prices).toEqual([100, 110, 121, 133.1]);
    });
  });
});
