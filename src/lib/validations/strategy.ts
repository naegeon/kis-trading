import { z } from 'zod';

// Base schema for common strategy fields including dates
// Using coerce to handle string to date conversion from form inputs
const baseStrategyFields = z.object({
  market: z.enum(['US', 'KR', 'US_DAYTIME']),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

export const splitOrderStrategySchema = baseStrategyFields.extend({
  symbol: z.string().min(1, '종목코드를 입력해주세요.'),
  basePrice: z.number().positive('기준가는 0보다 커야 합니다.'),
  totalQuantity: z.number().int().positive('총 매수 수량은 1주 이상이어야 합니다.'),
  orderCount: z.number().int().min(2, '주문 횟수는 2회 이상이어야 합니다.'),
  orderType: z.enum(['buy', 'sell']),
  priceChange: z.number().positive('가격 변동폭은 0보다 커야 합니다.'),
  priceChangeType: z.enum(['PERCENT', 'AMOUNT']),
  distribution: z.enum(['EQUAL', 'TRIANGULAR', 'INVERTED_TRIANGULAR']),
  targetReturnRate: z.number().positive('목표 수익률은 0보다 커야 합니다.'),
});

// Base schema without refine (for extending) - PRD.md Day 17-18
// [DEPRECATED] initialBuyQty, initialBuyPrice - 제거됨 (KIS API 보유 조회로 대체)
const looLocStrategyBaseSchema = baseStrategyFields.extend({
  symbol: z.string().min(1, '종목코드를 입력해주세요.'),
  looEnabled: z.boolean(),
  looQty: z.number().int().positive('LOO 매수 수량은 0보다 커야 합니다.'),
  locBuyEnabled: z.boolean(),
  locBuyQty: z.number().int().positive('LOC 매수 수량은 0보다 커야 합니다.'),
  targetReturnRate: z.number().positive('목표 수익률은 0보다 커야 합니다.'),
});

// Export schema with refine for form validation
export const looLocStrategySchema = looLocStrategyBaseSchema.refine(
  data => data.looEnabled || data.locBuyEnabled,
  {
    message: 'LOO 또는 LOC 매수 중 하나 이상을 활성화해야 합니다.',
    path: ['looEnabled'],
  }
);

export const strategySchema = z.discriminatedUnion("strategyType", [
  splitOrderStrategySchema.extend({ strategyType: z.literal('SPLIT_ORDER') }),
  looLocStrategyBaseSchema.extend({ strategyType: z.literal('LOO_LOC') }),
]);

