/**
 * Error handling utilities for standardized error processing
 * Phase 4: 에러 처리 일관화
 */

import { log } from '../logger';
import { AppError, KISAPIError } from '../errors';
import {
  DEFAULT_RETRY_CONFIG,
  KIS_RETRY_CONFIG,
  ERROR_STACK_MAX_LINES,
  NO_RETRY_ERROR_PATTERNS_KO,
  NO_RETRY_ERROR_PATTERNS_EN,
  RETRY_ERROR_PATTERNS_KO,
  RETRY_ERROR_PATTERNS_EN,
} from '../constants/api';

// ============================================================================
// Types
// ============================================================================

/**
 * 에러 컨텍스트 정보
 */
export interface ErrorContext {
  /** 함수 또는 작업 이름 */
  operation: string;
  /** 관련 사용자 ID */
  userId?: string;
  /** 관련 전략 ID */
  strategyId?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * 재시도 옵션
 */
export interface RetryOptions {
  /** 최대 재시도 횟수 (기본값: 3) */
  maxRetries?: number;
  /** 초기 지연 시간 (ms, 기본값: 1000) */
  initialDelayMs?: number;
  /** 최대 지연 시간 (ms, 기본값: 10000) */
  maxDelayMs?: number;
  /** 지수 백오프 배수 (기본값: 2) */
  backoffMultiplier?: number;
  /** 재시도 여부를 결정하는 함수 (특정 에러만 재시도) */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** 재시도 전 콜백 */
  onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;
}

/**
 * 재시도 결과
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

// ============================================================================
// Error Logging Helpers
// ============================================================================

/**
 * 에러 메시지를 추출합니다.
 * @param error 에러 객체 (unknown 타입)
 * @returns 에러 메시지 문자열
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    // 에러 객체에 message 속성이 있는 경우
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      return errorObj.message;
    }
    // 그 외에는 JSON으로 변환 시도
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error (non-serializable)';
    }
  }
  return 'Unknown error';
}

/**
 * 에러의 HTTP 상태 코드를 추출합니다.
 * @param error 에러 객체
 * @returns HTTP 상태 코드 (기본값: 500)
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.statusCode === 'number') {
      return errorObj.statusCode;
    }
    if (typeof errorObj.status === 'number') {
      return errorObj.status;
    }
  }
  return 500;
}

/**
 * 표준화된 에러 로깅 함수
 * 에러를 일관된 형식으로 로그에 기록합니다.
 *
 * @param error 발생한 에러
 * @param context 에러 컨텍스트 정보
 * @returns 로깅된 에러 메시지
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const message = await logError(error, {
 *     operation: 'submitOrder',
 *     userId: session.user.id,
 *     strategyId: strategy.id,
 *     metadata: { symbol: 'AAPL', quantity: 10 }
 *   });
 *   return api.error(message, getErrorStatusCode(error));
 * }
 * ```
 */
export async function logError(
  error: unknown,
  context: ErrorContext
): Promise<string> {
  const errorMessage = getErrorMessage(error);
  const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

  const formattedMessage = `[${context.operation}] ${errorType}: ${errorMessage}`;

  const metadata: Record<string, unknown> = {
    errorType,
    errorMessage,
    ...(context.metadata || {}),
  };

  // 에러 스택 추가 (Error 인스턴스인 경우)
  if (error instanceof Error && error.stack) {
    // 스택 트레이스의 처음 N줄만 저장 (너무 길지 않게)
    metadata.stack = error.stack.split('\n').slice(0, ERROR_STACK_MAX_LINES).join('\n');
  }

  await log(
    'ERROR',
    formattedMessage,
    metadata,
    context.userId,
    context.strategyId
  );

  return errorMessage;
}

/**
 * 경고 수준의 에러를 로깅합니다.
 * 작업은 계속 진행되지만 주의가 필요한 경우 사용합니다.
 *
 * @param message 경고 메시지
 * @param context 에러 컨텍스트 정보
 * @param error 선택적 에러 객체
 */
export async function logWarning(
  message: string,
  context: ErrorContext,
  error?: unknown
): Promise<void> {
  const formattedMessage = `[${context.operation}] ${message}`;

  const metadata: Record<string, unknown> = {
    ...(context.metadata || {}),
  };

  if (error) {
    metadata.errorMessage = getErrorMessage(error);
    if (error instanceof Error) {
      metadata.errorType = error.constructor.name;
    }
  }

  await log(
    'WARN',
    formattedMessage,
    metadata,
    context.userId,
    context.strategyId
  );
}

/**
 * 에러 없이 무시해야 하는 작업을 안전하게 실행합니다.
 * 에러가 발생해도 로깅만 하고 계속 진행합니다.
 *
 * @param operation 실행할 비동기 작업
 * @param context 에러 컨텍스트
 * @returns 작업 결과 또는 undefined (에러 시)
 *
 * @example
 * ```typescript
 * // 실패해도 계속 진행해야 하는 경우
 * await safeExecute(
 *   async () => await sendPushNotification(userId, 'title', 'message'),
 *   { operation: 'sendPushNotification', userId }
 * );
 * ```
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  context: ErrorContext
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    await logWarning(
      `작업 실패 (무시됨): ${getErrorMessage(error)}`,
      context,
      error
    );
    return undefined;
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * 지수 백오프 지연 시간을 계산합니다.
 * @param attempt 시도 횟수 (1부터 시작)
 * @param initialDelayMs 초기 지연 시간
 * @param maxDelayMs 최대 지연 시간
 * @param multiplier 지수 배수
 * @returns 지연 시간 (ms)
 */
function calculateBackoffDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  multiplier: number
): number {
  // 지수 백오프: delay = initialDelay * (multiplier ^ (attempt - 1))
  const delay = initialDelayMs * Math.pow(multiplier, attempt - 1);
  // 최대 지연 시간 제한
  return Math.min(delay, maxDelayMs);
}

/**
 * 지정된 시간만큼 대기합니다.
 * @param ms 대기 시간 (밀리초)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 기본 재시도 조건 함수
 * 네트워크 에러나 서버 에러(5xx)인 경우에만 재시도합니다.
 */
export function defaultShouldRetry(error: unknown, _attempt: number): boolean {
  // 클라이언트 에러(4xx)는 재시도하지 않음
  if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
    return false;
  }

  const errorMessage = getErrorMessage(error).toLowerCase();

  // 재시도해도 소용없는 에러들
  const noRetryPatterns = [
    ...NO_RETRY_ERROR_PATTERNS_KO,
    ...NO_RETRY_ERROR_PATTERNS_EN,
  ];

  if (noRetryPatterns.some(pattern => errorMessage.includes(pattern))) {
    return false;
  }

  // 재시도가 도움될 수 있는 에러들
  const retryPatterns = [
    ...RETRY_ERROR_PATTERNS_KO,
    ...RETRY_ERROR_PATTERNS_EN,
  ];

  if (retryPatterns.some(pattern => errorMessage.includes(pattern))) {
    return true;
  }

  // KIS API 에러는 재시도
  if (error instanceof KISAPIError) {
    // 5xx 에러만 재시도
    return error.statusCode >= 500;
  }

  // 기본적으로 재시도하지 않음 (안전한 기본값)
  return false;
}

/**
 * 재시도 로직을 포함한 비동기 함수 실행
 * 지수 백오프를 사용하여 실패 시 재시도합니다.
 *
 * @param operation 실행할 비동기 작업
 * @param options 재시도 옵션
 * @returns 재시도 결과 (성공 여부, 데이터, 에러, 시도 횟수)
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await kisClient.submitOrder(orderParams),
 *   {
 *     maxRetries: 3,
 *     initialDelayMs: 1000,
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`재시도 ${attempt}: ${delay}ms 후`);
 *     }
 *   }
 * );
 *
 * if (result.success) {
 *   return result.data;
 * } else {
 *   throw result.error;
 * }
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = DEFAULT_RETRY_CONFIG.MAX_RETRIES,
    initialDelayMs = DEFAULT_RETRY_CONFIG.INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_RETRY_CONFIG.MAX_DELAY_MS,
    backoffMultiplier = DEFAULT_RETRY_CONFIG.BACKOFF_MULTIPLIER,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    attempts = attempt;

    try {
      const data = await operation();
      return {
        success: true,
        data,
        attempts,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(getErrorMessage(error));

      // 마지막 시도이거나 재시도 조건에 맞지 않으면 중단
      if (attempt > maxRetries || !shouldRetry(error, attempt)) {
        break;
      }

      // 재시도 전 지연
      const delayMs = calculateBackoffDelay(attempt, initialDelayMs, maxDelayMs, backoffMultiplier);

      // 재시도 콜백 호출
      if (onRetry) {
        onRetry(error, attempt, delayMs);
      }

      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts,
  };
}

/**
 * 재시도 로직을 포함한 KIS API 호출 래퍼
 * withRetry를 KIS API에 최적화된 설정으로 사용합니다.
 *
 * @param operation 실행할 KIS API 호출
 * @param context 에러 컨텍스트 (로깅용)
 * @returns 성공 시 데이터, 실패 시 에러 throw
 *
 * @example
 * ```typescript
 * const orderResult = await withKISRetry(
 *   async () => await kisClient.submitOrder(params),
 *   { operation: 'submitOrder', userId, strategyId }
 * );
 * ```
 */
export async function withKISRetry<T>(
  operation: () => Promise<T>,
  context: ErrorContext
): Promise<T> {
  const result = await withRetry(operation, {
    maxRetries: KIS_RETRY_CONFIG.MAX_RETRIES,
    initialDelayMs: KIS_RETRY_CONFIG.INITIAL_DELAY_MS,
    maxDelayMs: KIS_RETRY_CONFIG.MAX_DELAY_MS,
    backoffMultiplier: KIS_RETRY_CONFIG.BACKOFF_MULTIPLIER,
    onRetry: async (error, attempt, delayMs) => {
      await logWarning(
        `KIS API 재시도 ${attempt}/${KIS_RETRY_CONFIG.MAX_RETRIES}: ${delayMs}ms 후 재시도`,
        { ...context, metadata: { ...context.metadata, attempt, delayMs } },
        error
      );
    },
  });

  if (result.success && result.data !== undefined) {
    return result.data;
  }

  // 실패 시 에러 로깅 및 throw
  await logError(result.error || new Error('Unknown error'), context);
  throw result.error || new Error('KIS API call failed after retries');
}

// ============================================================================
// API Response Helpers
// ============================================================================

/**
 * 표준 API 에러 응답을 생성합니다.
 * @param error 발생한 에러
 * @param context 에러 컨텍스트
 * @returns API 에러 응답 객체
 */
export async function createApiErrorResponse(
  error: unknown,
  context: ErrorContext
): Promise<{
  success: false;
  error: string;
  statusCode: number;
}> {
  const errorMessage = await logError(error, context);
  const statusCode = getErrorStatusCode(error);

  return {
    success: false,
    error: errorMessage,
    statusCode,
  };
}
