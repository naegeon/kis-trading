/**
 * KIS API 토큰을 서버 전역에서 캐싱하기 위한 모듈
 * 서버리스 환경에서 여러 요청 간 토큰을 공유합니다.
 */

interface TokenData {
  accessToken: string;
  expiresAt: Date;
  lastRequestTime: Date;
}

// 서버 전역 토큰 캐시 (사용자별)
const tokenCache = new Map<string, TokenData>();

// 토큰 요청 중인지 추적 (사용자별)
const tokenRequestLocks = new Map<string, Promise<TokenData>>();

/**
 * 캐시 키 생성 (앱키 기반)
 */
function getCacheKey(appkey: string): string {
  return `kis_token_${appkey}`;
}

/**
 * 캐시된 토큰 조회
 */
export function getCachedToken(appkey: string): TokenData | null {
  const key = getCacheKey(appkey);
  const cached = tokenCache.get(key);

  if (!cached) {
    return null;
  }

  // 만료되었으면 삭제하고 null 반환
  if (new Date() >= cached.expiresAt) {
    tokenCache.delete(key);
    return null;
  }

  return cached;
}

/**
 * 토큰을 캐시에 저장
 */
export function setCachedToken(
  appkey: string,
  accessToken: string,
  expiresIn: number
): TokenData {
  const key = getCacheKey(appkey);
  const now = new Date();

  // 만료 시간 계산 (5분 여유)
  const expiresAt = new Date(now.getTime() + (expiresIn - 300) * 1000);

  const tokenData: TokenData = {
    accessToken,
    expiresAt,
    lastRequestTime: now,
  };

  tokenCache.set(key, tokenData);

  return tokenData;
}

/**
 * 마지막 토큰 요청 시간 조회
 */
export function getLastTokenRequestTime(appkey: string): Date | null {
  const key = getCacheKey(appkey);
  const cached = tokenCache.get(key);
  return cached?.lastRequestTime || null;
}

/**
 * 토큰 요청 잠금 획득
 */
export function getTokenRequestLock(appkey: string): Promise<TokenData> | null {
  const key = getCacheKey(appkey);
  return tokenRequestLocks.get(key) || null;
}

/**
 * 토큰 요청 잠금 설정
 */
export function setTokenRequestLock(
  appkey: string,
  promise: Promise<TokenData>
): void {
  const key = getCacheKey(appkey);
  tokenRequestLocks.set(key, promise);
}

/**
 * 토큰 요청 잠금 해제
 */
export function clearTokenRequestLock(appkey: string): void {
  const key = getCacheKey(appkey);
  tokenRequestLocks.delete(key);
}

/**
 * 캐시 정리 (테스트용)
 */
export function clearTokenCache(appkey?: string): void {
  if (appkey) {
    const key = getCacheKey(appkey);
    tokenCache.delete(key);
    tokenRequestLocks.delete(key);
  } else {
    tokenCache.clear();
    tokenRequestLocks.clear();
  }
}
