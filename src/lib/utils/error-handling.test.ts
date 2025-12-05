/**
 * Error handling utilities tests
 * Phase 4: 에러 처리 일관화
 */

import {
  getErrorMessage,
  getErrorStatusCode,
  logError,
  logWarning,
  safeExecute,
  withRetry,
  withKISRetry,
  defaultShouldRetry,
  createApiErrorResponse,
} from './error-handling';
import { AppError, KISAPIError, ValidationError } from '../errors';

// Mock the logger
jest.mock('../logger', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}));

describe('Error Handling Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================================
  // getErrorMessage Tests
  // ============================================================================

  describe('getErrorMessage', () => {
    it('Error 인스턴스에서 메시지를 추출해야 함', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('문자열 에러를 그대로 반환해야 함', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('message 속성이 있는 객체에서 메시지를 추출해야 함', () => {
      const error = { message: 'Object error message' };
      expect(getErrorMessage(error)).toBe('Object error message');
    });

    it('일반 객체를 JSON으로 변환해야 함', () => {
      const error = { code: 'ERR001', detail: 'Some detail' };
      expect(getErrorMessage(error)).toBe('{"code":"ERR001","detail":"Some detail"}');
    });

    it('null에 대해 Unknown error를 반환해야 함', () => {
      expect(getErrorMessage(null)).toBe('Unknown error');
    });

    it('undefined에 대해 Unknown error를 반환해야 함', () => {
      expect(getErrorMessage(undefined)).toBe('Unknown error');
    });

    it('숫자에 대해 Unknown error를 반환해야 함', () => {
      expect(getErrorMessage(123)).toBe('Unknown error');
    });

    it('AppError에서 메시지를 추출해야 함', () => {
      const error = new AppError('Custom app error', 400);
      expect(getErrorMessage(error)).toBe('Custom app error');
    });

    it('KISAPIError에서 메시지를 추출해야 함', () => {
      const error = new KISAPIError('KIS API failed', 500);
      expect(getErrorMessage(error)).toBe('KIS API failed');
    });
  });

  // ============================================================================
  // getErrorStatusCode Tests
  // ============================================================================

  describe('getErrorStatusCode', () => {
    it('AppError에서 상태 코드를 추출해야 함', () => {
      const error = new AppError('Test error', 403);
      expect(getErrorStatusCode(error)).toBe(403);
    });

    it('KISAPIError에서 상태 코드를 추출해야 함', () => {
      const error = new KISAPIError('KIS error', 502);
      expect(getErrorStatusCode(error)).toBe(502);
    });

    it('ValidationError에서 상태 코드를 추출해야 함', () => {
      const error = new ValidationError('Invalid input');
      expect(getErrorStatusCode(error)).toBe(400);
    });

    it('statusCode 속성이 있는 객체에서 추출해야 함', () => {
      const error = { statusCode: 404, message: 'Not found' };
      expect(getErrorStatusCode(error)).toBe(404);
    });

    it('status 속성이 있는 객체에서 추출해야 함', () => {
      const error = { status: 409, message: 'Conflict' };
      expect(getErrorStatusCode(error)).toBe(409);
    });

    it('일반 Error에 대해 500을 반환해야 함', () => {
      const error = new Error('Generic error');
      expect(getErrorStatusCode(error)).toBe(500);
    });

    it('null에 대해 500을 반환해야 함', () => {
      expect(getErrorStatusCode(null)).toBe(500);
    });

    it('undefined에 대해 500을 반환해야 함', () => {
      expect(getErrorStatusCode(undefined)).toBe(500);
    });
  });

  // ============================================================================
  // logError Tests
  // ============================================================================

  describe('logError', () => {
    it('에러를 로그에 기록하고 메시지를 반환해야 함', async () => {
      const { log } = require('../logger');
      const error = new Error('Test error');

      const result = await logError(error, {
        operation: 'testOperation',
        userId: 'user123',
        strategyId: 'strategy456',
      });

      expect(result).toBe('Test error');
      expect(log).toHaveBeenCalledWith(
        'ERROR',
        '[testOperation] Error: Test error',
        expect.objectContaining({
          errorType: 'Error',
          errorMessage: 'Test error',
        }),
        'user123',
        'strategy456'
      );
    });

    it('메타데이터를 포함해야 함', async () => {
      const { log } = require('../logger');
      const error = new KISAPIError('API failed', 500);

      await logError(error, {
        operation: 'submitOrder',
        metadata: { symbol: 'AAPL', quantity: 10 },
      });

      expect(log).toHaveBeenCalledWith(
        'ERROR',
        '[submitOrder] KISAPIError: API failed',
        expect.objectContaining({
          errorType: 'KISAPIError',
          errorMessage: 'API failed',
          symbol: 'AAPL',
          quantity: 10,
        }),
        undefined,
        undefined
      );
    });

    it('에러 스택을 포함해야 함', async () => {
      const { log } = require('../logger');
      const error = new Error('Error with stack');

      await logError(error, { operation: 'test' });

      expect(log).toHaveBeenCalledWith(
        'ERROR',
        expect.any(String),
        expect.objectContaining({
          stack: expect.any(String),
        }),
        undefined,
        undefined
      );
    });
  });

  // ============================================================================
  // logWarning Tests
  // ============================================================================

  describe('logWarning', () => {
    it('경고 메시지를 로그에 기록해야 함', async () => {
      const { log } = require('../logger');

      await logWarning('Something might be wrong', {
        operation: 'checkStatus',
        userId: 'user123',
      });

      expect(log).toHaveBeenCalledWith(
        'WARN',
        '[checkStatus] Something might be wrong',
        expect.any(Object),
        'user123',
        undefined
      );
    });

    it('에러 정보를 포함해야 함', async () => {
      const { log } = require('../logger');
      const error = new Error('Warning cause');

      await logWarning('Operation failed but continuing', { operation: 'retry' }, error);

      expect(log).toHaveBeenCalledWith(
        'WARN',
        '[retry] Operation failed but continuing',
        expect.objectContaining({
          errorMessage: 'Warning cause',
          errorType: 'Error',
        }),
        undefined,
        undefined
      );
    });
  });

  // ============================================================================
  // safeExecute Tests
  // ============================================================================

  describe('safeExecute', () => {
    it('성공 시 결과를 반환해야 함', async () => {
      const result = await safeExecute(
        async () => 'success',
        { operation: 'test' }
      );

      expect(result).toBe('success');
    });

    it('실패 시 undefined를 반환하고 로그를 기록해야 함', async () => {
      const { log } = require('../logger');

      const result = await safeExecute(
        async () => {
          throw new Error('Failed');
        },
        { operation: 'test' }
      );

      expect(result).toBeUndefined();
      expect(log).toHaveBeenCalledWith(
        'WARN',
        expect.stringContaining('[test]'),
        expect.any(Object),
        undefined,
        undefined
      );
    });

    it('복잡한 작업에서도 에러를 안전하게 처리해야 함', async () => {
      const result = await safeExecute(
        async () => {
          throw new KISAPIError('API Error', 500);
        },
        { operation: 'kisApiCall', userId: 'user1' }
      );

      expect(result).toBeUndefined();
    });
  });

  // ============================================================================
  // defaultShouldRetry Tests
  // ============================================================================

  describe('defaultShouldRetry', () => {
    it('네트워크 에러는 재시도해야 함', () => {
      expect(defaultShouldRetry(new Error('Network error'), 1)).toBe(true);
      expect(defaultShouldRetry(new Error('ECONNRESET'), 1)).toBe(true);
      expect(defaultShouldRetry(new Error('timeout'), 1)).toBe(true);
    });

    it('인증 에러는 재시도하지 않아야 함', () => {
      expect(defaultShouldRetry(new Error('Unauthorized'), 1)).toBe(false);
      expect(defaultShouldRetry(new Error('인증 실패'), 1)).toBe(false);
    });

    it('잘못된 입력 에러는 재시도하지 않아야 함', () => {
      expect(defaultShouldRetry(new Error('Invalid input'), 1)).toBe(false);
      expect(defaultShouldRetry(new Error('잘못된 요청'), 1)).toBe(false);
    });

    it('4xx AppError는 재시도하지 않아야 함', () => {
      expect(defaultShouldRetry(new AppError('Bad request', 400), 1)).toBe(false);
      expect(defaultShouldRetry(new AppError('Forbidden', 403), 1)).toBe(false);
    });

    it('5xx KISAPIError는 재시도해야 함', () => {
      expect(defaultShouldRetry(new KISAPIError('Server error', 500), 1)).toBe(true);
      expect(defaultShouldRetry(new KISAPIError('Bad gateway', 502), 1)).toBe(true);
    });

    it('4xx KISAPIError는 재시도하지 않아야 함', () => {
      expect(defaultShouldRetry(new KISAPIError('Bad request', 400), 1)).toBe(false);
    });
  });

  // ============================================================================
  // withRetry Tests
  // ============================================================================

  describe('withRetry', () => {
    it('첫 번째 시도에서 성공하면 바로 반환해야 함', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toEqual({
        success: true,
        data: 'success',
        attempts: 1,
      });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('실패 후 재시도해서 성공하면 결과를 반환해야 함', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        initialDelayMs: 10, // 테스트 속도를 위해 짧게 설정
      });

      expect(result).toEqual({
        success: true,
        data: 'success',
        attempts: 2,
      });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('최대 재시도 횟수를 초과하면 실패를 반환해야 함', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await withRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Network error');
      expect(result.attempts).toBe(3); // 초기 시도 1 + 재시도 2
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('shouldRetry가 false를 반환하면 즉시 중단해야 함', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Invalid input'));

      const result = await withRetry(operation, {
        maxRetries: 3,
        initialDelayMs: 10,
        shouldRetry: () => false,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('onRetry 콜백이 호출되어야 함', async () => {
      const onRetry = jest.fn();
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      await withRetry(operation, {
        initialDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        expect.any(Number)
      );
    });

    it('지수 백오프가 적용되어야 함', async () => {
      const onRetry = jest.fn();
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      await withRetry(operation, {
        initialDelayMs: 100,
        backoffMultiplier: 2,
        onRetry,
      });

      // 첫 번째 재시도: 100ms, 두 번째 재시도: 200ms
      expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 200);
    });

    it('최대 지연 시간이 적용되어야 함', async () => {
      const onRetry = jest.fn();
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      await withRetry(operation, {
        initialDelayMs: 1000,
        maxDelayMs: 1500,
        backoffMultiplier: 2,
        maxRetries: 3,
        onRetry,
      });

      // 1000, 2000 -> 1500 (max), 4000 -> 1500 (max)
      expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 1000);
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 1500);
      expect(onRetry).toHaveBeenNthCalledWith(3, expect.any(Error), 3, 1500);
    });
  });

  // ============================================================================
  // withKISRetry Tests
  // ============================================================================

  describe('withKISRetry', () => {
    it('성공 시 데이터를 반환해야 함', async () => {
      const operation = jest.fn().mockResolvedValue({ orderId: '123' });

      const result = await withKISRetry(operation, {
        operation: 'submitOrder',
        userId: 'user1',
      });

      expect(result).toEqual({ orderId: '123' });
    });

    it('실패 시 에러를 throw해야 함', async () => {
      const operation = jest.fn().mockRejectedValue(new AppError('Failed', 400));

      await expect(
        withKISRetry(operation, { operation: 'submitOrder' })
      ).rejects.toThrow('Failed');
    });
  });

  // ============================================================================
  // createApiErrorResponse Tests
  // ============================================================================

  describe('createApiErrorResponse', () => {
    it('표준 에러 응답을 생성해야 함', async () => {
      const error = new AppError('Bad request', 400);

      const response = await createApiErrorResponse(error, {
        operation: 'createStrategy',
      });

      expect(response).toEqual({
        success: false,
        error: 'Bad request',
        statusCode: 400,
      });
    });

    it('일반 Error에 대해 500 상태 코드를 사용해야 함', async () => {
      const error = new Error('Unknown error');

      const response = await createApiErrorResponse(error, {
        operation: 'unknownOperation',
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
