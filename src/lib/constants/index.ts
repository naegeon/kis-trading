/**
 * 상수 모듈 진입점
 * Phase 5: 상수 통합
 *
 * 사용법:
 * import { STRATEGY_EXECUTION_INTERVAL_MS, US_MARKET_HOURS_DST } from '@/lib/constants';
 * 또는 개별 파일에서 직접 import:
 * import { STRATEGY_EXECUTION_INTERVAL_MS } from '@/lib/constants/trading';
 */

// 전략 관련 상수 (레이블, 상태 등)
export * from './strategy';

// 트레이딩 관련 상수 (실행 간격, 가격, 거래소 코드 등)
export * from './trading';

// 시장 관련 상수 (시간대, 시장 시간 등)
export * from './market';

// API 관련 상수 (재시도, 타임아웃 등)
export * from './api';
