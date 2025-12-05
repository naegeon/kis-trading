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
  calculateAveragePrice,
  roundPriceForUS,
  roundPriceForKR,
  getKRTickSize,
  roundPriceForMarket,
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

    it('한국 시장(KR) 호가 단위를 적용해야 한다', () => {
      // 기준가 50000원, 1000원씩 하락, 3회 매수 (호가 단위 50원)
      const prices = calculateSplitPrices(50000, 1000, 'USD', 3, 'BUY', 'KR');
      expect(prices).toEqual([50000, 49000, 48000]); // 이미 호가 단위에 맞음

      // 기준가 50000원, 1%씩 하락, 3회 매수
      // 50000 -> 49500 -> 49005
      // 매수 내림: 50000 -> 49500 -> 49000
      const pricesPercent = calculateSplitPrices(50000, 1, 'PERCENT', 3, 'BUY', 'KR');
      expect(pricesPercent).toEqual([50000, 49500, 49000]);
    });

    it('한국 시장(KR) 매도 시 올림 처리해야 한다', () => {
      // 기준가 50000원, 1%씩 상승, 3회 매도
      // 50000 -> 50500 -> 51005
      // 매도 올림 (100원 단위): 50000 -> 50500 -> 51100
      const prices = calculateSplitPrices(50000, 1, 'PERCENT', 3, 'SELL', 'KR');
      expect(prices).toEqual([50000, 50500, 51100]);
    });
  });

  describe('미국 시장 가격 반올림 (roundPriceForUS)', () => {
    it('소수점 2자리로 반올림해야 한다', () => {
      expect(roundPriceForUS(28.089)).toBe(28.09);
      expect(roundPriceForUS(23.4075)).toBe(23.41);
      expect(roundPriceForUS(100.125)).toBe(100.13); // 반올림
      expect(roundPriceForUS(100.124)).toBe(100.12); // 버림
      expect(roundPriceForUS(99.995)).toBe(100); // 반올림
    });

    it('이미 2자리인 가격은 그대로 유지해야 한다', () => {
      expect(roundPriceForUS(28.09)).toBe(28.09);
      expect(roundPriceForUS(100.00)).toBe(100);
      expect(roundPriceForUS(50.5)).toBe(50.5);
    });
  });

  describe('한국 시장 호가 단위 (getKRTickSize)', () => {
    it('가격 구간별 호가 단위를 정확히 반환해야 한다', () => {
      // 2,000원 미만: 1원
      expect(getKRTickSize(1000)).toBe(1);
      expect(getKRTickSize(1999)).toBe(1);

      // 2,000원 이상 ~ 5,000원 미만: 5원
      expect(getKRTickSize(2000)).toBe(5);
      expect(getKRTickSize(4999)).toBe(5);

      // 5,000원 이상 ~ 20,000원 미만: 10원
      expect(getKRTickSize(5000)).toBe(10);
      expect(getKRTickSize(19999)).toBe(10);

      // 20,000원 이상 ~ 50,000원 미만: 50원
      expect(getKRTickSize(20000)).toBe(50);
      expect(getKRTickSize(49999)).toBe(50);

      // 50,000원 이상 ~ 200,000원 미만: 100원
      expect(getKRTickSize(50000)).toBe(100);
      expect(getKRTickSize(199999)).toBe(100);

      // 200,000원 이상 ~ 500,000원 미만: 500원
      expect(getKRTickSize(200000)).toBe(500);
      expect(getKRTickSize(499999)).toBe(500);

      // 500,000원 이상: 1,000원
      expect(getKRTickSize(500000)).toBe(1000);
      expect(getKRTickSize(1000000)).toBe(1000);
    });
  });

  describe('한국 시장 가격 조정 (roundPriceForKR)', () => {
    it('매수 시 내림 처리해야 한다', () => {
      // 50,000원대 (호가 단위 100원)
      expect(roundPriceForKR(50123, 'BUY')).toBe(50100);
      expect(roundPriceForKR(50199, 'BUY')).toBe(50100);

      // 20,000원대 (호가 단위 50원)
      expect(roundPriceForKR(23456, 'BUY')).toBe(23450);
      expect(roundPriceForKR(23499, 'BUY')).toBe(23450);

      // 5,000원대 (호가 단위 10원)
      expect(roundPriceForKR(5678, 'BUY')).toBe(5670);
    });

    it('매도 시 올림 처리해야 한다', () => {
      // 50,000원대 (호가 단위 100원)
      expect(roundPriceForKR(50123, 'SELL')).toBe(50200);
      expect(roundPriceForKR(50101, 'SELL')).toBe(50200);

      // 20,000원대 (호가 단위 50원)
      expect(roundPriceForKR(23456, 'SELL')).toBe(23500);
      expect(roundPriceForKR(23401, 'SELL')).toBe(23450);

      // 5,000원대 (호가 단위 10원)
      expect(roundPriceForKR(5678, 'SELL')).toBe(5680);
    });

    it('이미 호가 단위에 맞는 가격은 그대로 유지해야 한다', () => {
      expect(roundPriceForKR(50000, 'BUY')).toBe(50000);
      expect(roundPriceForKR(50000, 'SELL')).toBe(50000);
      expect(roundPriceForKR(23450, 'BUY')).toBe(23450);
      expect(roundPriceForKR(23450, 'SELL')).toBe(23450);
    });
  });

  describe('시장별 가격 조정 (roundPriceForMarket)', () => {
    it('미국 시장은 소수점 2자리로 처리해야 한다', () => {
      expect(roundPriceForMarket(28.089, 'US', 'BUY')).toBe(28.09);
      expect(roundPriceForMarket(28.089, 'US', 'SELL')).toBe(28.09);
    });

    it('한국 시장은 호가 단위로 처리해야 한다', () => {
      expect(roundPriceForMarket(50123, 'KR', 'BUY')).toBe(50100);
      expect(roundPriceForMarket(50123, 'KR', 'SELL')).toBe(50200);
    });
  });

  describe('평균가 계산 (calculateAveragePrice)', () => {
    it('기존 보유와 신규 매수를 합산하여 평균가를 계산해야 한다', () => {
      // 100주를 10달러에 보유, 50주를 8달러에 추가 매수
      // (100 * 10 + 50 * 8) / (100 + 50) = 1400 / 150 = 9.333...
      expect(calculateAveragePrice(10, 100, 8, 50)).toBeCloseTo(9.333, 2);
    });

    it('처음 매수 시 평균가는 매수 가격과 동일해야 한다', () => {
      // 보유 0주, 100주를 25달러에 매수
      expect(calculateAveragePrice(0, 0, 25, 100)).toBe(25);
    });

    it('동일 가격에 추가 매수 시 평균가가 변하지 않아야 한다', () => {
      // 100주를 50달러에 보유, 100주를 50달러에 추가 매수
      expect(calculateAveragePrice(50, 100, 50, 100)).toBe(50);
    });

    it('높은 가격에 추가 매수 시 평균가가 상승해야 한다', () => {
      // 100주를 10달러에 보유, 100주를 20달러에 추가 매수
      // (100 * 10 + 100 * 20) / 200 = 15
      expect(calculateAveragePrice(10, 100, 20, 100)).toBe(15);
    });

    it('낮은 가격에 추가 매수 시 평균가가 하락해야 한다', () => {
      // 100주를 20달러에 보유, 100주를 10달러에 추가 매수
      // (100 * 20 + 100 * 10) / 200 = 15
      expect(calculateAveragePrice(20, 100, 10, 100)).toBe(15);
    });

    it('수량이 0인 경우 0을 반환해야 한다', () => {
      expect(calculateAveragePrice(0, 0, 0, 0)).toBe(0);
    });

    it('한국 시장 원화 가격에서도 정확히 계산해야 한다', () => {
      // 100주를 50000원에 보유, 50주를 48000원에 추가 매수
      // (100 * 50000 + 50 * 48000) / 150 = 7400000 / 150 = 49333.33...
      expect(calculateAveragePrice(50000, 100, 48000, 50)).toBeCloseTo(49333.33, 0);
    });
  });

  describe('매도 목표가 계산', () => {
    it('미국 시장에서 목표 수익률 기준 매도가를 계산해야 한다', () => {
      // 평균가 100달러, 목표 수익률 5%
      // 목표가 = 100 * 1.05 = 105
      const avgCost = 100;
      const targetReturnRate = 5;
      const targetSellPrice = roundPriceForMarket(
        avgCost * (1 + targetReturnRate / 100),
        'US',
        'SELL'
      );
      expect(targetSellPrice).toBe(105);
    });

    it('미국 시장에서 소수점이 발생하면 2자리로 반올림해야 한다', () => {
      // 평균가 33.33달러, 목표 수익률 3%
      // 목표가 = 33.33 * 1.03 = 34.3299
      const avgCost = 33.33;
      const targetReturnRate = 3;
      const targetSellPrice = roundPriceForMarket(
        avgCost * (1 + targetReturnRate / 100),
        'US',
        'SELL'
      );
      expect(targetSellPrice).toBe(34.33);
    });

    it('한국 시장에서 목표가를 호가 단위로 올림해야 한다', () => {
      // 평균가 50000원, 목표 수익률 3%
      // 목표가 = 50000 * 1.03 = 51500 (호가 100원 단위, 정확히 맞음)
      const avgCost = 50000;
      const targetReturnRate = 3;
      const targetSellPrice = roundPriceForMarket(
        avgCost * (1 + targetReturnRate / 100),
        'KR',
        'SELL'
      );
      expect(targetSellPrice).toBe(51500);
    });

    it('한국 시장에서 호가 단위에 맞지 않으면 올림 처리해야 한다', () => {
      // 평균가 49333원, 목표 수익률 3%
      // 목표가 = 49333 * 1.03 = 50812.99 -> 올림 -> 50900
      const avgCost = 49333;
      const targetReturnRate = 3;
      const targetSellPrice = roundPriceForMarket(
        avgCost * (1 + targetReturnRate / 100),
        'KR',
        'SELL'
      );
      expect(targetSellPrice).toBe(50900);
    });
  });
});
