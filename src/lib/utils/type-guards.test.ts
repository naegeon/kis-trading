/**
 * Type Guards 테스트
 */
import {
  isSplitOrderParams,
  isLooLocParams,
  parseStrategyParams,
  isValidMarket,
  isValidExchangeCode,
  isValidStrategyStatus,
  isValidStrategyType,
  isValidOrderSide,
  isValidDistributionType,
  isKISBaseResponse,
  isKISSuccessResponse,
  isKISOrderOutput,
  isKISOverseasHoldingItem,
  isKISDomesticHoldingItem,
  isNonNullObject,
  isValidNumber,
  isPositiveNumber,
  isNonNegativeNumber,
  isNonEmptyString,
  isValidUUID,
  isValidDateString,
} from './type-guards';

// ============================================================================
// Strategy Parameter Type Guards
// ============================================================================

describe('isSplitOrderParams', () => {
  const validParams = {
    basePrice: 100,
    declineValue: 5,
    declineUnit: 'PERCENT' as const,
    splitCount: 5,
    distributionType: 'PYRAMID' as const,
    totalAmount: 1000,
    side: 'BUY' as const,
  };

  it('should return true for valid SplitOrderParams', () => {
    expect(isSplitOrderParams(validParams)).toBe(true);
  });

  it('should return true for valid params with optional fields', () => {
    const paramsWithOptional = {
      ...validParams,
      currentAvgCost: 98.5,
      currentQty: 10,
      targetReturnRate: 5,
      isDaytime: true,
      exchangeCode: 'NASD' as const,
      processedOrderIds: ['order1', 'order2'],
    };
    expect(isSplitOrderParams(paramsWithOptional)).toBe(true);
  });

  it('should return false for null or undefined', () => {
    expect(isSplitOrderParams(null)).toBe(false);
    expect(isSplitOrderParams(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isSplitOrderParams('string')).toBe(false);
    expect(isSplitOrderParams(123)).toBe(false);
  });

  it('should return false for missing required fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { basePrice, ...missing } = validParams;
    expect(isSplitOrderParams(missing)).toBe(false);
  });

  it('should return false for invalid declineUnit', () => {
    expect(isSplitOrderParams({ ...validParams, declineUnit: 'INVALID' })).toBe(false);
  });

  it('should return false for invalid distributionType', () => {
    expect(isSplitOrderParams({ ...validParams, distributionType: 'INVALID' })).toBe(false);
  });

  it('should return false for invalid side', () => {
    expect(isSplitOrderParams({ ...validParams, side: 'INVALID' })).toBe(false);
  });

  it('should return false for invalid splitCount (must be positive integer)', () => {
    expect(isSplitOrderParams({ ...validParams, splitCount: 0 })).toBe(false);
    expect(isSplitOrderParams({ ...validParams, splitCount: -1 })).toBe(false);
    expect(isSplitOrderParams({ ...validParams, splitCount: 1.5 })).toBe(false);
  });

  it('should return false for NaN or Infinity values', () => {
    expect(isSplitOrderParams({ ...validParams, basePrice: NaN })).toBe(false);
    expect(isSplitOrderParams({ ...validParams, totalAmount: Infinity })).toBe(false);
  });

  it('should return false for invalid optional exchangeCode', () => {
    expect(isSplitOrderParams({ ...validParams, exchangeCode: 'INVALID' })).toBe(false);
  });

  it('should return false for invalid processedOrderIds', () => {
    expect(isSplitOrderParams({ ...validParams, processedOrderIds: [1, 2, 3] })).toBe(false);
    expect(isSplitOrderParams({ ...validParams, processedOrderIds: 'not-array' })).toBe(false);
  });
});

describe('isLooLocParams', () => {
  const validParams = {
    looEnabled: true,
    looQty: 10,
    locBuyEnabled: false,
    locBuyQty: 5,
    targetReturnRate: 3,
  };

  it('should return true for valid LooLocParams', () => {
    expect(isLooLocParams(validParams)).toBe(true);
  });

  it('should return true for valid params with optional fields', () => {
    const paramsWithOptional = {
      ...validParams,
      initialBuyQty: 100,
      initialBuyPrice: 50.5,
      isFirstExecution: false,
      currentAvgCost: 52.3,
      currentQty: 100,
      exchangeCode: 'NYSE' as const,
    };
    expect(isLooLocParams(paramsWithOptional)).toBe(true);
  });

  it('should return false for null or undefined', () => {
    expect(isLooLocParams(null)).toBe(false);
    expect(isLooLocParams(undefined)).toBe(false);
  });

  it('should return false for missing required fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { looEnabled, ...missing } = validParams;
    expect(isLooLocParams(missing)).toBe(false);
  });

  it('should return false for non-boolean looEnabled', () => {
    expect(isLooLocParams({ ...validParams, looEnabled: 'true' })).toBe(false);
  });

  it('should return false for non-number looQty', () => {
    expect(isLooLocParams({ ...validParams, looQty: '10' })).toBe(false);
  });

  it('should return false for invalid exchangeCode', () => {
    expect(isLooLocParams({ ...validParams, exchangeCode: 'INVALID' })).toBe(false);
  });
});

describe('parseStrategyParams', () => {
  const splitOrderParams = {
    basePrice: 100,
    declineValue: 5,
    declineUnit: 'PERCENT' as const,
    splitCount: 5,
    distributionType: 'PYRAMID' as const,
    totalAmount: 1000,
    side: 'BUY' as const,
  };

  const looLocParams = {
    looEnabled: true,
    looQty: 10,
    locBuyEnabled: false,
    locBuyQty: 5,
    targetReturnRate: 3,
  };

  it('should return SplitOrderParams for valid SPLIT_ORDER type', () => {
    const result = parseStrategyParams(splitOrderParams, 'SPLIT_ORDER');
    expect(result).toEqual(splitOrderParams);
  });

  it('should return LooLocParams for valid LOO_LOC type', () => {
    const result = parseStrategyParams(looLocParams, 'LOO_LOC');
    expect(result).toEqual(looLocParams);
  });

  it('should return null for invalid params', () => {
    expect(parseStrategyParams({}, 'SPLIT_ORDER')).toBeNull();
    expect(parseStrategyParams({}, 'LOO_LOC')).toBeNull();
  });

  it('should return null for mismatched type', () => {
    expect(parseStrategyParams(splitOrderParams, 'LOO_LOC')).toBeNull();
    expect(parseStrategyParams(looLocParams, 'SPLIT_ORDER')).toBeNull();
  });
});

// ============================================================================
// Market Type Guards
// ============================================================================

describe('isValidMarket', () => {
  it('should return true for US', () => {
    expect(isValidMarket('US')).toBe(true);
  });

  it('should return true for KR', () => {
    expect(isValidMarket('KR')).toBe(true);
  });

  it('should return false for invalid market', () => {
    expect(isValidMarket('JP')).toBe(false);
    expect(isValidMarket('')).toBe(false);
    expect(isValidMarket(null)).toBe(false);
  });
});

describe('isValidExchangeCode', () => {
  it('should return true for valid exchange codes', () => {
    expect(isValidExchangeCode('NASD')).toBe(true);
    expect(isValidExchangeCode('NYSE')).toBe(true);
    expect(isValidExchangeCode('AMEX')).toBe(true);
  });

  it('should return false for invalid exchange codes', () => {
    expect(isValidExchangeCode('KOSPI')).toBe(false);
    expect(isValidExchangeCode('')).toBe(false);
    expect(isValidExchangeCode(null)).toBe(false);
  });
});

describe('isValidStrategyStatus', () => {
  it('should return true for valid statuses', () => {
    expect(isValidStrategyStatus('ACTIVE')).toBe(true);
    expect(isValidStrategyStatus('INACTIVE')).toBe(true);
    expect(isValidStrategyStatus('ENDED')).toBe(true);
  });

  it('should return false for invalid statuses', () => {
    expect(isValidStrategyStatus('PENDING')).toBe(false);
    expect(isValidStrategyStatus('')).toBe(false);
  });
});

describe('isValidStrategyType', () => {
  it('should return true for valid types', () => {
    expect(isValidStrategyType('SPLIT_ORDER')).toBe(true);
    expect(isValidStrategyType('LOO_LOC')).toBe(true);
  });

  it('should return false for invalid types', () => {
    expect(isValidStrategyType('DCA')).toBe(false);
    expect(isValidStrategyType('')).toBe(false);
  });
});

describe('isValidOrderSide', () => {
  it('should return true for valid sides', () => {
    expect(isValidOrderSide('BUY')).toBe(true);
    expect(isValidOrderSide('SELL')).toBe(true);
  });

  it('should return false for invalid sides', () => {
    expect(isValidOrderSide('HOLD')).toBe(false);
    expect(isValidOrderSide('')).toBe(false);
  });
});

describe('isValidDistributionType', () => {
  it('should return true for valid types', () => {
    expect(isValidDistributionType('PYRAMID')).toBe(true);
    expect(isValidDistributionType('EQUAL')).toBe(true);
    expect(isValidDistributionType('INVERTED')).toBe(true);
  });

  it('should return false for invalid types', () => {
    expect(isValidDistributionType('LINEAR')).toBe(false);
    expect(isValidDistributionType('')).toBe(false);
  });
});

// ============================================================================
// KIS API Response Type Guards
// ============================================================================

describe('isKISBaseResponse', () => {
  it('should return true for valid response', () => {
    const response = { rt_cd: '0', msg_cd: 'MCA00000', msg1: 'Success' };
    expect(isKISBaseResponse(response)).toBe(true);
  });

  it('should return false for missing fields', () => {
    expect(isKISBaseResponse({ rt_cd: '0' })).toBe(false);
    expect(isKISBaseResponse({})).toBe(false);
    expect(isKISBaseResponse(null)).toBe(false);
  });
});

describe('isKISSuccessResponse', () => {
  it('should return true for success response (rt_cd === "0")', () => {
    const response = { rt_cd: '0', msg_cd: 'MCA00000', msg1: 'Success' };
    expect(isKISSuccessResponse(response)).toBe(true);
  });

  it('should return false for error response', () => {
    const response = { rt_cd: '1', msg_cd: 'ERR00001', msg1: 'Error' };
    expect(isKISSuccessResponse(response)).toBe(false);
  });
});

describe('isKISOrderOutput', () => {
  it('should return true for output with ODNO', () => {
    expect(isKISOrderOutput({ ODNO: '0001234567' })).toBe(true);
  });

  it('should return true for output with ODNO_ECLS (overseas)', () => {
    expect(isKISOrderOutput({ ODNO_ECLS: 'US123456' })).toBe(true);
  });

  it('should return false for empty output', () => {
    expect(isKISOrderOutput({})).toBe(false);
    expect(isKISOrderOutput(null)).toBe(false);
  });
});

describe('isKISOverseasHoldingItem', () => {
  it('should return true for valid holding item', () => {
    const item = {
      ovrs_pdno: 'AAPL',
      ovrs_item_name: 'Apple Inc',
      ovrs_cblc_qty: '10',
      pchs_avg_pric: '150.50',
      frcr_evlu_pfls_amt: '100.00',
      evlu_pfls_rt: '6.64',
      now_pric2: '160.50',
    };
    expect(isKISOverseasHoldingItem(item)).toBe(true);
  });

  it('should return false for missing required fields', () => {
    expect(isKISOverseasHoldingItem({ ovrs_pdno: 'AAPL' })).toBe(false);
  });
});

describe('isKISDomesticHoldingItem', () => {
  it('should return true for valid holding item', () => {
    const item = {
      pdno: '005930',
      prdt_name: '삼성전자',
      hldg_qty: '100',
      pchs_avg_pric: '70000',
      evlu_pfls_amt: '500000',
      evlu_pfls_rt: '7.14',
      prpr: '75000',
    };
    expect(isKISDomesticHoldingItem(item)).toBe(true);
  });

  it('should return false for missing required fields', () => {
    expect(isKISDomesticHoldingItem({ pdno: '005930' })).toBe(false);
  });
});

// ============================================================================
// Utility Type Guards
// ============================================================================

describe('isNonNullObject', () => {
  it('should return true for plain object', () => {
    expect(isNonNullObject({})).toBe(true);
    expect(isNonNullObject({ key: 'value' })).toBe(true);
  });

  it('should return false for null', () => {
    expect(isNonNullObject(null)).toBe(false);
  });

  it('should return false for array', () => {
    expect(isNonNullObject([])).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(isNonNullObject('string')).toBe(false);
    expect(isNonNullObject(123)).toBe(false);
    expect(isNonNullObject(true)).toBe(false);
  });
});

describe('isValidNumber', () => {
  it('should return true for valid numbers', () => {
    expect(isValidNumber(0)).toBe(true);
    expect(isValidNumber(-1)).toBe(true);
    expect(isValidNumber(3.14)).toBe(true);
  });

  it('should return false for NaN', () => {
    expect(isValidNumber(NaN)).toBe(false);
  });

  it('should return false for Infinity', () => {
    expect(isValidNumber(Infinity)).toBe(false);
    expect(isValidNumber(-Infinity)).toBe(false);
  });

  it('should return false for non-numbers', () => {
    expect(isValidNumber('123')).toBe(false);
    expect(isValidNumber(null)).toBe(false);
  });
});

describe('isPositiveNumber', () => {
  it('should return true for positive numbers', () => {
    expect(isPositiveNumber(1)).toBe(true);
    expect(isPositiveNumber(0.001)).toBe(true);
  });

  it('should return false for zero', () => {
    expect(isPositiveNumber(0)).toBe(false);
  });

  it('should return false for negative numbers', () => {
    expect(isPositiveNumber(-1)).toBe(false);
  });
});

describe('isNonNegativeNumber', () => {
  it('should return true for positive numbers and zero', () => {
    expect(isNonNegativeNumber(0)).toBe(true);
    expect(isNonNegativeNumber(1)).toBe(true);
  });

  it('should return false for negative numbers', () => {
    expect(isNonNegativeNumber(-1)).toBe(false);
  });
});

describe('isNonEmptyString', () => {
  it('should return true for non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString(' ')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(isNonEmptyString('')).toBe(false);
  });

  it('should return false for non-strings', () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(123)).toBe(false);
  });
});

describe('isValidUUID', () => {
  it('should return true for valid UUIDs', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
  });

  it('should return false for invalid UUIDs', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
    expect(isValidUUID('')).toBe(false);
  });
});

describe('isValidDateString', () => {
  it('should return true for valid date strings', () => {
    expect(isValidDateString('2024-01-15')).toBe(true);
    expect(isValidDateString('2024-12-31')).toBe(true);
  });

  it('should return false for invalid date strings', () => {
    expect(isValidDateString('2024/01/15')).toBe(false);
    expect(isValidDateString('01-15-2024')).toBe(false);
    expect(isValidDateString('2024-13-01')).toBe(false); // Invalid month
    expect(isValidDateString('')).toBe(false);
  });
});
