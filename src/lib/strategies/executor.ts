import { Strategy } from '@/types/strategy';
import { KISClient } from '@/lib/kis/client';
import { db } from '@/lib/db/client';
import { strategies } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { executeSplitOrderStrategy } from './split-order';
import { executeLooLocStrategy } from './loo-loc';
import { log } from '@/lib/logger';
import {
  STRATEGY_EXECUTION_INTERVAL_MS,
  IMMEDIATE_EXECUTION_TIMEOUT_MS,
} from '@/lib/constants/trading';

/**
 * 전략을 즉시 실행하고 lastExecutedAt 타임스탬프를 업데이트합니다.
 * 전략 생성/수정 시 호출됩니다.
 *
 * @param strategy 실행할 전략
 * @param kisClient KIS API 클라이언트
 * @param timeout 타임아웃 (밀리초, 기본 10000ms)
 * @returns 성공 여부
 */
export async function executeStrategyImmediately(
  strategy: Strategy,
  kisClient: KISClient,
  timeout: number = IMMEDIATE_EXECUTION_TIMEOUT_MS
): Promise<{ success: boolean; message: string }> {
  try {
    await log(
      'INFO',
      `[Immediate Execution] Starting strategy ${strategy.id} (${strategy.type})`,
      {},
      strategy.userId,
      strategy.id
    );

    // 타임아웃과 함께 전략 실행
    const executePromise = strategy.type === 'SPLIT_ORDER'
      ? executeSplitOrderStrategy(strategy, kisClient)
      : executeLooLocStrategy(strategy, kisClient);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Execution timeout')), timeout)
    );

    await Promise.race([executePromise, timeoutPromise]);

    // 성공 시 lastExecutedAt 업데이트
    await db
      .update(strategies)
      .set({ lastExecutedAt: new Date() })
      .where(eq(strategies.id, strategy.id));

    await log(
      'INFO',
      `[Immediate Execution] Successfully executed strategy ${strategy.id}`,
      {},
      strategy.userId,
      strategy.id
    );

    return {
      success: true,
      message: '전략이 성공적으로 실행되었습니다.'
    };
  } catch (error) {
    // 에러 발생 시에도 타임스탬프는 업데이트 (중복 방지)
    await db
      .update(strategies)
      .set({ lastExecutedAt: new Date() })
      .where(eq(strategies.id, strategy.id));

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await log(
      'WARN',
      `[Immediate Execution] Failed to execute strategy ${strategy.id}: ${errorMessage}`,
      { error: errorMessage },
      strategy.userId,
      strategy.id
    );

    // 실패해도 전략은 저장되었으므로 다음 크론잡에서 재시도 가능
    return {
      success: false,
      message: '전략이 저장되었지만 즉시 실행에 실패했습니다. 다음 주기에 자동으로 실행됩니다.'
    };
  }
}

/**
 * 전략 실행 가능 여부를 확인합니다.
 * 최근 10분 이내에 실행되었는지 체크합니다.
 *
 * @param strategy 확인할 전략
 * @returns 실행 가능 여부
 */
export function canExecuteStrategy(strategy: Strategy): boolean {
  if (!strategy.lastExecutedAt) {
    return true; // 한 번도 실행되지 않았으면 실행 가능
  }

  const now = new Date();
  const timeSinceExecution = now.getTime() - strategy.lastExecutedAt.getTime();

  return timeSinceExecution >= STRATEGY_EXECUTION_INTERVAL_MS;
}
