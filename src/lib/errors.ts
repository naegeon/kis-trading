/**
 * 애플리케이션의 기본 에러 클래스
 */
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * KIS API 호출 관련 에러
 */
export class KISAPIError extends AppError {
  constructor(message = 'KIS API request failed', statusCode = 500) {
    super(message, statusCode);
  }
}

/**
 * 유효성 검사 실패 시 발생하는 에러
 */
export class ValidationError extends AppError {
  constructor(message = 'Invalid input provided', statusCode = 400) {
    super(message, statusCode);
  }
}

/**
 * 인증 관련 에러 (로그인 실패 등)
 */
export class AuthError extends AppError {
  constructor(message = 'Authentication failed', statusCode = 401) {
    super(message, statusCode);
  }
}
