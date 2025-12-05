/**
 * API 관련 상수
 * Phase 5: 상수 통합 - 재시도 로직, 타임아웃 등 API 관련 설정
 */

// ============================================================================
// 재시도 관련 상수
// ============================================================================

/**
 * 기본 재시도 설정
 */
export const DEFAULT_RETRY_CONFIG = {
  /** 최대 재시도 횟수 */
  MAX_RETRIES: 3,
  /** 초기 지연 시간 (ms) */
  INITIAL_DELAY_MS: 1000,
  /** 최대 지연 시간 (ms) */
  MAX_DELAY_MS: 10000,
  /** 지수 백오프 배수 */
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * KIS API 전용 재시도 설정
 * Rate limit을 고려하여 더 긴 지연 시간 사용
 */
export const KIS_RETRY_CONFIG = {
  /** 최대 재시도 횟수 */
  MAX_RETRIES: 3,
  /** 초기 지연 시간 (ms) - KIS API rate limit 고려 */
  INITIAL_DELAY_MS: 2000,
  /** 최대 지연 시간 (ms) */
  MAX_DELAY_MS: 8000,
  /** 지수 백오프 배수 */
  BACKOFF_MULTIPLIER: 2,
} as const;

// ============================================================================
// KIS API 관련 상수
// ============================================================================

/**
 * KIS API 토큰 관련 설정
 */
export const KIS_TOKEN_CONFIG = {
  /** 토큰 요청 최소 간격 (ms) - 1분당 1회 제한 고려 */
  MIN_REQUEST_INTERVAL_MS: 61000, // 61초 (안전 마진 포함)
  /** 기본 토큰 만료 시간 (초) */
  DEFAULT_EXPIRES_IN_SECONDS: 86400, // 24시간
} as const;

/**
 * KIS API 요청 간 대기 시간 (ms)
 * 여러 종목 가격 조회 시 rate limit 방지
 */
export const KIS_REQUEST_DELAY_MS = 300;

// ============================================================================
// HTTP 상태 코드
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * 재시도 가능한 HTTP 상태 코드
 * 5xx 서버 에러는 일시적일 수 있으므로 재시도
 */
export const RETRYABLE_STATUS_CODES = [
  HTTP_STATUS.BAD_GATEWAY,
  HTTP_STATUS.SERVICE_UNAVAILABLE,
  HTTP_STATUS.GATEWAY_TIMEOUT,
] as const;

/**
 * 재시도하지 않는 HTTP 상태 코드
 * 4xx 클라이언트 에러는 재시도해도 동일한 결과
 */
export const NON_RETRYABLE_STATUS_CODES = [
  HTTP_STATUS.BAD_REQUEST,
  HTTP_STATUS.UNAUTHORIZED,
  HTTP_STATUS.FORBIDDEN,
  HTTP_STATUS.NOT_FOUND,
] as const;

// ============================================================================
// 타임아웃 관련 상수
// ============================================================================

export const TIMEOUT = {
  /** 기본 API 요청 타임아웃 (ms) */
  DEFAULT_API_REQUEST_MS: 30000, // 30초
  /** 크론잡 실행 타임아웃 (ms) */
  CRON_JOB_MS: 120000, // 2분
  /** 전략 즉시 실행 타임아웃 (ms) */
  STRATEGY_IMMEDIATE_EXECUTION_MS: 10000, // 10초
} as const;

// ============================================================================
// 에러 로깅 관련 상수
// ============================================================================

/**
 * 에러 스택 트레이스 최대 라인 수
 */
export const ERROR_STACK_MAX_LINES = 5;

/**
 * 재시도하지 않을 에러 메시지 패턴 (한국어)
 */
export const NO_RETRY_ERROR_PATTERNS_KO = [
  '인증',
  '권한',
  '잘못된',
  '없습니다',
] as const;

/**
 * 재시도하지 않을 에러 메시지 패턴 (영어)
 */
export const NO_RETRY_ERROR_PATTERNS_EN = [
  'unauthorized',
  'forbidden',
  'invalid',
  'not found',
] as const;

/**
 * 재시도할 에러 메시지 패턴 (한국어)
 */
export const RETRY_ERROR_PATTERNS_KO = [
  '네트워크',
  '시간 초과',
  '연결',
  '서버',
  '일시적',
  '요청 제한',
] as const;

/**
 * 재시도할 에러 메시지 패턴 (영어)
 */
export const RETRY_ERROR_PATTERNS_EN = [
  'network',
  'timeout',
  'econnreset',
  'econnrefused',
  'socket',
  'server error',
  'temporary',
  'rate limit',
] as const;
