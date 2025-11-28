/**
 * DB 기반 KIS API 토큰 캐싱
 * 서버리스 환경에서 콜드 스타트 시에도 토큰을 재사용합니다.
 */

import { db } from '@/lib/db/client';
import { credentials } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt } from '@/lib/crypto/encryption';

interface TokenData {
  accessToken: string;
  expiresAt: Date;
}

// 토큰 만료 전 갱신 여유 시간 (5분)
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * DB에서 캐시된 토큰 조회
 * @param credentialsId credentials 테이블의 ID
 * @returns 유효한 토큰 데이터 또는 null
 */
export async function getDbCachedToken(credentialsId: string): Promise<TokenData | null> {
  try {
    const cred = await db.query.credentials.findFirst({
      where: eq(credentials.id, credentialsId),
      columns: {
        kisAccessToken: true,
        kisTokenExpiresAt: true,
      },
    });

    if (!cred?.kisAccessToken || !cred?.kisTokenExpiresAt) {
      return null;
    }

    const expiresAt = new Date(cred.kisTokenExpiresAt);
    const now = new Date();

    // 만료 5분 전이면 갱신 필요
    if (now.getTime() >= expiresAt.getTime() - TOKEN_REFRESH_MARGIN_MS) {
      return null;
    }

    // 토큰 복호화
    const accessToken = decrypt(cred.kisAccessToken);

    return {
      accessToken,
      expiresAt,
    };
  } catch (error) {
    console.error('[TokenDbCache] Failed to get cached token:', error);
    return null;
  }
}

/**
 * DB에 토큰 저장
 * @param credentialsId credentials 테이블의 ID
 * @param accessToken 접근 토큰
 * @param expiresIn 만료까지 남은 시간 (초)
 */
export async function setDbCachedToken(
  credentialsId: string,
  accessToken: string,
  expiresIn: number
): Promise<void> {
  try {
    // 토큰 암호화
    const encryptedToken = encrypt(accessToken);

    // 만료 시간 계산
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await db
      .update(credentials)
      .set({
        kisAccessToken: encryptedToken,
        kisTokenExpiresAt: expiresAt,
      })
      .where(eq(credentials.id, credentialsId));

    console.log('[TokenDbCache] Token saved to DB, expires at:', expiresAt.toISOString());
  } catch (error) {
    console.error('[TokenDbCache] Failed to save token:', error);
    throw error;
  }
}

/**
 * DB의 캐시된 토큰 삭제
 * @param credentialsId credentials 테이블의 ID
 */
export async function clearDbCachedToken(credentialsId: string): Promise<void> {
  try {
    await db
      .update(credentials)
      .set({
        kisAccessToken: null,
        kisTokenExpiresAt: null,
      })
      .where(eq(credentials.id, credentialsId));
  } catch (error) {
    console.error('[TokenDbCache] Failed to clear token:', error);
  }
}
