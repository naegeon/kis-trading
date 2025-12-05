/* eslint-disable no-console */
import { db } from '@/lib/db/client';
import { executionLogs, logLevelEnum, eventTypeEnum } from '@/lib/db/schema';

export type LogLevel = typeof logLevelEnum.enumValues[number];
export type EventType = typeof eventTypeEnum.enumValues[number];

// 민감 정보 키 목록
const SENSITIVE_KEYS = [
  'appkey',
  'appsecret',
  'accountnumber',
  'password',
  'token',
  'authorization',
  'apikey',
  'secret',
  'encryptionkey',
];

/**
 * 객체에서 민감 정보를 제거하고 마스킹된 복사본을 반환
 * @param data 정제할 데이터
 * @returns 민감 정보가 마스킹된 복사본
 */
function sanitizeMetadata(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeMetadata);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // 민감 정보 키인 경우 마스킹
    if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Logs a message and stores it in the database if the level is WARN or ERROR.
 * @param level The log level.
 * @param message The message to log.
 * @param metadata Optional metadata to store with the log.
 * @param userId Optional ID of the user related to the log.
 * @param strategyId Optional ID of the strategy related to the log.
 * @param eventType Optional event type for filtering (ORDER_SUBMITTED, ORDER_FAILED, etc.)
 */
export async function log(
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>,
  userId?: string,
  strategyId?: string,
  eventType?: EventType
): Promise<void> {
  // 민감 정보 필터링
  const sanitizedMetadata = metadata ? (sanitizeMetadata(metadata) as Record<string, unknown>) : undefined;

  const logEntry: {
    logLevel: LogLevel;
    message: string;
    metadata?: Record<string, unknown>;
    userId?: string;
    strategyId?: string;
    eventType?: EventType;
  } = {
    logLevel: level,
    message,
    metadata: sanitizedMetadata,
    userId,
    strategyId,
    eventType,
  };

  // 개발 환경에서만 콘솔 로그 출력
  if (process.env.NODE_ENV === 'development') {
    const eventLabel = eventType ? `[${eventType}]` : '';
    const formattedMessage = `[${level}]${eventLabel} ${message}`;
    if (level === 'ERROR') {
      console.error(formattedMessage, sanitizedMetadata ?? '');
    } else if (level === 'WARN') {
      console.warn(formattedMessage, sanitizedMetadata ?? '');
    } else {
      console.log(formattedMessage, sanitizedMetadata ?? '');
    }
  }

  // Store in database for WARN, ERROR, and important INFO messages
  // INFO messages are only stored if they are cron-related, have a strategyId, or have an eventType
  const shouldStoreInDb =
    level === 'WARN' ||
    level === 'ERROR' ||
    (level === 'INFO' && (message.includes('Cron job') || strategyId || eventType));

  if (shouldStoreInDb) {
    try {
      // strategyId가 제공된 경우, 전략이 존재하는지 확인
      if (strategyId) {
        const { strategies } = await import('@/lib/db/schema');
        const { eq } = await import('drizzle-orm');

        const strategy = await db.query.strategies.findFirst({
          where: eq(strategies.id, strategyId),
        });

        // 전략이 존재하지 않으면 strategyId를 null로 설정
        if (!strategy) {
          logEntry.strategyId = undefined;
        }
      }

      await db.insert(executionLogs).values(logEntry);
    } catch (dbError) {
      console.error('Failed to write log to database:', dbError);
    }
  }
}