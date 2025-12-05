import { KISConfig, OrderParams, OrderResponse, AccountInfo, StockPrice, PriceData, KISHolding, KISOverasBalanceResponse, KISOrderDetail, KISOrderDetailResponse, AccountBalance, KISDomesticBalanceResponse, KISDomesticOrderResponse, KISOverasDepositResponse, OverseasStockPrice, KISOverseasPriceResponse } from './types';
import { Order } from '@/types/order';
import { getKISApiUrl } from './config';
import { KISAPIError } from '../errors';
import {
  getCachedToken,
  setCachedToken,
  getLastTokenRequestTime,
  getTokenRequestLock,
  setTokenRequestLock,
  clearTokenRequestLock,
} from './token-cache';
import {
  getDbCachedToken,
  setDbCachedToken,
} from './token-db-cache';
import { KIS_TOKEN_CONFIG, KIS_REQUEST_DELAY_MS } from '../constants/api';
import { US_EXCHANGES, ORDER_HISTORY_DAYS } from '../constants/trading';

// Internal response types
interface KISOrderResponse {
  output: { ODNO: string };
  msg1: string;
}

interface KISPriceResponse {
  output: Record<string, string>;
}

const TR_CODES = {
  // === 국내 주식 (한국) ===
  // 실거래
  DOMESTIC_ORDER_BUY: 'TTTC0012U', // 국내 주식 매수 (실거래)
  DOMESTIC_ORDER_SELL: 'TTTC0011U', // 국내 주식 매도 (실거래)
  DOMESTIC_ORDER_CANCEL: 'TTTC0013U', // 국내 주식 정정취소 (실거래)
  DOMESTIC_BALANCE: 'TTTC8434R', // 국내 주식 잔고 조회 (실거래)

  // 모의투자
  DOMESTIC_ORDER_BUY_MOCK: 'VTTC0012U', // 국내 주식 매수 (모의투자)
  DOMESTIC_ORDER_SELL_MOCK: 'VTTC0011U', // 국내 주식 매도 (모의투자)
  DOMESTIC_ORDER_CANCEL_MOCK: 'VTTC0013U', // 국내 주식 정정취소 (모의투자)
  DOMESTIC_BALANCE_MOCK: 'VTTC8434R', // 국내 주식 잔고 조회 (모의투자)

  // === 해외 주식 (미국) ===
  // 실거래
  OVERSEAS_ORDER_BUY: 'TTTT1002U', // 미국 주식 매수 (실거래)
  OVERSEAS_ORDER_SELL: 'TTTT1006U', // 미국 주식 매도 (실거래)
  OVERSEAS_ORDER_CANCEL: 'TTTT1004U', // 미국 주식 정정취소 (실거래)
  OVERSEAS_BALANCE: 'TTTS3012R', // 해외 주식 잔고 조회 (실거래)
  OVERSEAS_MARGIN: 'TTTC2101R', // 해외 증거금 통화별 조회 (실거래, 모의투자 미지원)
  OVERSEAS_DAYTIME_BUY: 'TTTS6036U', // 미국 주식 주간매수 (실거래, 모의투자 미지원)
  OVERSEAS_DAYTIME_SELL: 'TTTS6037U', // 미국 주식 주간매도 (실거래, 모의투자 미지원)
  OVERSEAS_DAYTIME_CANCEL: 'TTTS6038U', // 미국 주식 주간정정취소 (실거래, 모의투자 미지원)
  OVERSEAS_UNFILLED: 'TTTS3018R', // 해외 주식 미체결 조회 (실거래, 모의투자 미지원)

  // 모의투자
  OVERSEAS_ORDER_BUY_MOCK: 'VTTT1002U', // 미국 주식 매수 (모의투자)
  OVERSEAS_ORDER_SELL_MOCK: 'VTTT1001U', // 미국 주식 매도 (모의투자)
  OVERSEAS_ORDER_CANCEL_MOCK: 'VTTT1004U', // 미국 주식 정정취소 (모의투자)
  OVERSEAS_BALANCE_MOCK: 'VTTS3012R', // 해외 주식 잔고 조회 (모의투자)
  // 해외 증거금, 미체결, 주간매매: 모의투자 미지원

  // === 공통 ===
  INQUIRE_PRICE: 'FHKST01010100', // 국내 주식 현재가 시세
  INQUIRE_OVERSEAS_PRICE: 'HHDFS00000300', // 해외 주식 현재체결가
};

/**
 * 한국투자증권(KIS) API 클라이언트
 */
export class KISClient {
  private readonly config: KISConfig;
  private readonly apiUrl: string;
  private readonly accountNumber: string;

  constructor(config: KISConfig) {
    this.config = config;
    this.apiUrl = getKISApiUrl(config.isMock);
    this.accountNumber = config.accountNumber;
  }

  /**
   * 계좌번호를 KIS API 형식에 맞게 분리합니다.
   * @returns [CANO (8자리), ACNT_PRDT_CD (2자리)]
   * @throws {KISAPIError} 계좌번호 형식이 올바르지 않은 경우
   */
  private parseAccountNumber(): [string, string] {
    // 하이픈 제거
    const cleaned = this.accountNumber.replace(/-/g, '');

    if (cleaned.length < 8) {
      throw new KISAPIError('계좌번호는 최소 8자리 이상이어야 합니다', 400);
    }

    // CANO: 앞 8자리 (부족하면 앞에 0 패딩)
    let cano = cleaned.substring(0, 8);
    if (cano.length < 8) {
      cano = cano.padStart(8, '0');
    }

    // ACNT_PRDT_CD: 나머지 2자리 (없으면 '01' 기본값, 부족하면 뒤에 0 패딩)
    let acntPrdtCd = cleaned.substring(8, 10);
    if (!acntPrdtCd) {
      acntPrdtCd = '01';
    } else if (acntPrdtCd.length < 2) {
      acntPrdtCd = acntPrdtCd.padEnd(2, '0');
    }

    return [cano, acntPrdtCd];
  }

  /**
   * API 요청 전 유효한 액세스 토큰을 보장합니다.
   * 1. 메모리 캐시 확인 (같은 인스턴스 내 요청)
   * 2. DB 캐시 확인 (서버리스 콜드 스타트 대응)
   * 3. 없으면 새로 발급
   */
  private async ensureValidToken(): Promise<string> {
    // 1. 메모리 캐시에서 유효한 토큰 확인
    const memoryCached = getCachedToken(this.config.appkey);
    if (memoryCached) {
      return memoryCached.accessToken;
    }

    // 2. DB 캐시에서 유효한 토큰 확인 (credentialsId가 있는 경우)
    if (this.config.credentialsId) {
      const dbCached = await getDbCachedToken(this.config.credentialsId);
      if (dbCached) {
        // 메모리 캐시에도 저장 (이후 요청 최적화)
        const expiresIn = Math.floor((dbCached.expiresAt.getTime() - Date.now()) / 1000);
        setCachedToken(this.config.appkey, dbCached.accessToken, expiresIn);
        return dbCached.accessToken;
      }
    }

    // 3. 이미 다른 요청이 토큰을 갱신 중이면 대기
    const existingLock = getTokenRequestLock(this.config.appkey);
    if (existingLock) {
      const tokenData = await existingLock;
      return tokenData.accessToken;
    }

    // 4. 새로운 토큰 요청 시작
    const tokenPromise = this.refreshToken();
    setTokenRequestLock(this.config.appkey, tokenPromise);

    try {
      const tokenData = await tokenPromise;
      return tokenData.accessToken;
    } finally {
      clearTokenRequestLock(this.config.appkey);
    }
  }

  /**
   * 새로운 액세스 토큰을 발급받아 전역 캐시에 저장합니다.
   * KIS API는 1분당 1회 제한이 있으므로, 최근 60초 이내 요청했다면 기다립니다.
   */
  private async refreshToken(): Promise<{ accessToken: string; expiresAt: Date; lastRequestTime: Date }> {
    // 1분 이내에 토큰 요청을 했다면 대기
    const lastRequestTime = getLastTokenRequestTime(this.config.appkey);
    if (lastRequestTime) {
      const timeSinceLastRequest = Date.now() - lastRequestTime.getTime();

      if (timeSinceLastRequest < KIS_TOKEN_CONFIG.MIN_REQUEST_INTERVAL_MS) {
        const waitTime = KIS_TOKEN_CONFIG.MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
        await this.sleep(waitTime);
      }
    }

    const url = `${this.apiUrl}/oauth2/tokenP`;
    const body = {
      grant_type: 'client_credentials',
      appkey: this.config.appkey,
      appsecret: this.config.appsecret,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new KISAPIError(
          `접근토큰 발급 실패: ${errorData.msg1 || errorData.error_description || response.statusText}`,
          response.status
        );
      }

      const data = await response.json();
      const accessToken = data.access_token;
      const expiresIn = data.expires_in || KIS_TOKEN_CONFIG.DEFAULT_EXPIRES_IN_SECONDS;

      // 메모리 캐시에 저장
      const tokenData = setCachedToken(this.config.appkey, accessToken, expiresIn);

      // DB 캐시에도 저장 (credentialsId가 있는 경우)
      if (this.config.credentialsId) {
        await setDbCachedToken(this.config.credentialsId, accessToken, expiresIn);
      }

      return tokenData;

    } catch (error) {
      if (error instanceof KISAPIError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new KISAPIError(`토큰 갱신 중 네트워크 오류: ${errorMessage}`);
    }
  }

  /**
   * KIS API에 인증된 요청을 보내는 내부 헬퍼 함수
   * @param method HTTP 메소드
   * @param path 요청 경로
   * @param trId Transaction ID
   * @param body 요청 바디
   * @returns API 응답 데이터
   */
  private async _request(method: 'GET' | 'POST', path: string, trId: string, body: Record<string, unknown> = {}, params: Record<string, string> = {}): Promise<unknown> {
    const accessToken = await this.ensureValidToken();

    let url = `${this.apiUrl}${path}`;
    if (method === 'GET' && Object.keys(params).length > 0) {
      url += `?${new URLSearchParams(params).toString()}`;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'appkey': this.config.appkey,
      'appsecret': this.config.appsecret,
      'tr_id': trId,
      'custtype': 'P', // 개인
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(method === 'POST' && { body: JSON.stringify(body) }),
      });

      // 응답 텍스트 먼저 읽기 (빈 응답 처리)
      const responseText = await response.text();

      // 빈 응답 체크
      if (!responseText || responseText.trim() === '') {
        throw new KISAPIError(`Empty response from KIS API (${path})`, response.status);
      }

      // JSON 파싱 시도
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        // JSON 파싱 실패 시 원본 응답 일부를 포함하여 에러 throw
        const errorDetail = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        throw new KISAPIError(`Invalid JSON response from KIS API (${errorDetail}): ${responseText.substring(0, 200)}`, response.status);
      }

      // HTTP 상태 코드 체크
      if (!response.ok) {
        throw new KISAPIError(`API request failed: ${data.msg1 || response.statusText}`, response.status);
      }

      // KIS API 응답 코드 체크 (rt_cd가 '0'이 아니면 에러)
      if (data.rt_cd && data.rt_cd !== '0') {
        throw new KISAPIError(`KIS API error: ${data.msg1 || data.msg_cd || 'Unknown error'} (rt_cd: ${data.rt_cd})`, response.status);
      }

      return data;
    } catch (error) {
      if (error instanceof KISAPIError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new KISAPIError(`Network error during API request: ${errorMessage}`);
    }
  }

  /**
   * 지정된 시간(ms)만큼 실행을 지연시키는 유틸리티 함수
   * @param ms 지연시킬 시간 (밀리초)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- Public API Methods ---

  /**
   * 주식 주문을 제출합니다 (국내/해외, 모의투자/실거래 자동 구분).
   * @param params 주문 파라미터
   * @returns 주문 응답
   */
  async submitOrder(params: OrderParams): Promise<OrderResponse> {
    const [accNo, accCode] = this.parseAccountNumber();

    // 1. 시장별 TR_ID 및 엔드포인트 설정
    let path: string;
    let trId: string;
    let bodyBase: Record<string, string>;

    if (params.market === 'KR') {
      // === 국내 주식 ===
      path = '/uapi/domestic-stock/v1/trading/order-cash';

      // TR_ID 선택 (모의투자/실거래)
      if (params.side === 'BUY') {
        trId = this.config.isMock ? TR_CODES.DOMESTIC_ORDER_BUY_MOCK : TR_CODES.DOMESTIC_ORDER_BUY;
      } else {
        trId = this.config.isMock ? TR_CODES.DOMESTIC_ORDER_SELL_MOCK : TR_CODES.DOMESTIC_ORDER_SELL;
      }

      // 국내 주식 주문 구분 코드
      let orderDivisionCode = '00'; // 00: 지정가
      if (params.orderType === 'MARKET') {
        orderDivisionCode = '01'; // 01: 시장가
      }

      bodyBase = {
        CANO: accNo,
        ACNT_PRDT_CD: accCode,
        PDNO: params.symbol,
        ORD_DVSN: orderDivisionCode,
        ORD_QTY: params.quantity.toString(),
        ORD_UNPR: params.orderType === 'MARKET' ? '0' : params.price?.toString() ?? '0',
      };

    } else {
      // === 해외 주식 ===
      path = '/uapi/overseas-stock/v1/trading/order';

      // TR_ID 선택 (모의투자/실거래)
      // 중요: 매수는 TTTT1002U, 매도는 TTTT1006U (공식 문서 기준)
      if (params.side === 'BUY') {
        trId = this.config.isMock ? TR_CODES.OVERSEAS_ORDER_BUY_MOCK : TR_CODES.OVERSEAS_ORDER_BUY;
      } else {
        trId = this.config.isMock ? TR_CODES.OVERSEAS_ORDER_SELL_MOCK : TR_CODES.OVERSEAS_ORDER_SELL;
      }

      // 해외 주식 주문 구분 코드 (ORD_DVSN)
      let orderDivisionCode = '00'; // 기본값: 지정가

      if (params.orderType === 'MARKET') {
        orderDivisionCode = '01'; // 시장가
      } else if (this.config.isMock) {
        // 모의투자에서는 LOO, LOC를 지정가('00')로 처리
        if (params.orderType === 'LOO' || params.orderType === 'LOC') {
          orderDivisionCode = '00';
        }
      } else {
        // 실거래에서 LOO/LOC 지원 (공식 문서 기준)
        // 매수: 32=LOO, 34=LOC
        // 매도: 31=MOO, 32=LOO, 33=MOC, 34=LOC
        if (params.orderType === 'LOO') {
          orderDivisionCode = '32'; // LOO (장개시지정가)
        } else if (params.orderType === 'LOC') {
          orderDivisionCode = '34'; // LOC (장마감지정가)
        }
      }

      // 종목 코드는 반드시 대문자로 전송 (KIS API 요구사항)
      const symbolUpper = params.symbol.toUpperCase();

      bodyBase = {
        CANO: accNo,
        ACNT_PRDT_CD: accCode,
        OVRS_EXCG_CD: params.exchangeCode || 'NASD', // 거래소 코드 (NASD, NYSE, AMEX 등), 기본값: NASD
        PDNO: symbolUpper,
        ORD_DVSN: orderDivisionCode,
        ORD_QTY: params.quantity.toString(),
        OVRS_ORD_UNPR: params.orderType === 'MARKET' ? '0' : params.price?.toString() ?? '0',
        ORD_SVR_DVSN_CD: '0', // 주문 서버 구분 (0: 해외)
      };
    }

    const response = await this._request('POST', path, trId, bodyBase) as KISOrderResponse;

    // KIS API 응답 검증
    if (!response || !response.output || !response.output.ODNO) {
      const errorResponse = response as { rt_cd?: string; msg1?: string };
      throw new KISAPIError(
        `Invalid KIS API response: ${JSON.stringify(response)}. rt_cd: ${errorResponse?.rt_cd}, msg: ${errorResponse?.msg1}`,
        500
      );
    }

    return {
      orderId: response.output.ODNO,
      status: 'SUBMITTED',
      message: response.msg1,
    };
  }

  /**
   * 주문을 취소합니다 (국내/해외, 모의투자/실거래 자동 구분).
   * @param params 취소 파라미터
   * @returns 주문 응답
   */
  async cancelOrder(params: { kisOrderId: string; symbol: string; quantity: number; market: 'US' | 'KR'; exchangeCode?: 'NASD' | 'NYSE' | 'AMEX'; }): Promise<OrderResponse> {
    const [accNo, accCode] = this.parseAccountNumber();

    let path: string;
    let trId: string;
    let body: Record<string, string>;

    if (params.market === 'KR') {
      // === 국내 주식 취소 ===
      path = '/uapi/domestic-stock/v1/trading/order-rvsecncl';
      trId = this.config.isMock ? TR_CODES.DOMESTIC_ORDER_CANCEL_MOCK : TR_CODES.DOMESTIC_ORDER_CANCEL;

      body = {
        CANO: accNo,
        ACNT_PRDT_CD: accCode,
        KRX_FWDG_ORD_ORGNO: '', // 한국거래소전송주문조직번호 (공백)
        ORGN_ODNO: params.kisOrderId,
        ORD_DVSN: '00', // 주문구분 (00: 지정가)
        RVSE_CNCL_DVSN_CD: '02', // 정정취소구분 (02: 취소)
        ORD_QTY: '0',
        ORD_UNPR: '0',
        QTY_ALL_ORD_YN: 'Y', // 잔량전부주문여부 (Y: 전량)
      };

    } else {
      // === 해외 주식 취소 ===
      path = '/uapi/overseas-stock/v1/trading/order-rvsecncl';
      trId = this.config.isMock ? TR_CODES.OVERSEAS_ORDER_CANCEL_MOCK : TR_CODES.OVERSEAS_ORDER_CANCEL;

      // 종목 코드는 반드시 대문자로 전송 (KIS API 요구사항)
      const symbolUpper = params.symbol.toUpperCase();

      body = {
        CANO: accNo,
        ACNT_PRDT_CD: accCode,
        OVRS_EXCG_CD: params.exchangeCode || 'NASD', // 거래소 코드, 기본값: NASD
        PDNO: symbolUpper,
        ORGN_ODNO: params.kisOrderId,
        RVSE_CNCL_DVSN_CD: '02', // 02: 취소
        ORD_QTY: '0',
        OVRS_ORD_UNPR: '0',
        ORD_SVR_DVSN_CD: '0',
      };
    }

    const response = await this._request('POST', path, trId, body) as KISOrderResponse;
    return {
      orderId: response.output.ODNO,
      status: 'CANCELLED',
      message: response.msg1,
    };
  }

  /**
   * 미국 주식 주간매매 주문 (분할매매 전략에서 사용)
   * 주의: 모의투자 API는 주간매매를 지원하지 않습니다.
   * @param params 주문 파라미터 (market은 'US'만 지원)
   * @returns 주문 응답
   * @throws {KISAPIError} 모의투자 모드이거나 한국 시장인 경우
   */
  async submitDaytimeOrder(params: OrderParams): Promise<OrderResponse> {
    // 주간매매는 실거래 + 미국 시장만 지원
    if (this.config.isMock) {
      throw new KISAPIError('주간매매는 모의투자를 지원하지 않습니다. 실거래 API로 전환해주세요.', 400);
    }

    if (params.market !== 'US') {
      throw new KISAPIError('주간매매는 미국 시장만 지원합니다.', 400);
    }

    const [accNo, accCode] = this.parseAccountNumber();

    // TR_ID 선택 (매수/매도)
    const trId = params.side === 'BUY'
      ? TR_CODES.OVERSEAS_DAYTIME_BUY
      : TR_CODES.OVERSEAS_DAYTIME_SELL;

    // 종목 코드는 반드시 대문자로 전송 (KIS API 요구사항)
    const symbolUpper = params.symbol.toUpperCase();

    // 주간매매는 지정가만 지원
    const body = {
      CANO: accNo,
      ACNT_PRDT_CD: accCode,
      OVRS_EXCG_CD: params.exchangeCode || 'NASD', // 거래소 코드 (NASD, NYSE, AMEX), 기본값: NASD
      PDNO: symbolUpper,
      ORD_QTY: params.quantity.toString(),
      OVRS_ORD_UNPR: params.price?.toString() ?? '0', // 지정가
      CTAC_TLNO: '', // 연락전화번호 (선택)
      MGCO_APTM_ODNO: '', // 운용사지정주문번호 (선택)
      ORD_SVR_DVSN_CD: '0', // 주문서버구분코드 (0: 해외)
      ORD_DVSN: '00', // 00: 지정가 (주간매매는 지정가만 가능)
    };

    const path = '/uapi/overseas-stock/v1/trading/daytime-order';

    const response = await this._request('POST', path, trId, body) as KISOrderResponse;

    // KIS API 응답 검증
    if (!response || !response.output || !response.output.ODNO) {
      const errorResponse = response as { rt_cd?: string; msg_cd?: string; msg1?: string };

      // 주간매매 특정 에러 코드 처리
      if (errorResponse?.msg_cd === 'APBK0656' || errorResponse?.msg1?.includes('해당종목정보가 없습니다')) {
        throw new KISAPIError(
          `${params.symbol} 종목은 주간매매를 지원하지 않습니다. 정규장 전략으로 변경해주세요.`,
          400
        );
      }

      throw new KISAPIError(
        `주간매매 주문 실패: ${errorResponse?.msg1 || JSON.stringify(response)}`,
        500
      );
    }

    return {
      orderId: response.output.ODNO,
      status: 'SUBMITTED',
      message: response.msg1,
    };
  }

  /**
   * 미국 주식 주간매매 주문 취소
   * 주의: 모의투자 API는 주간매매를 지원하지 않습니다.
   * @param params 취소 파라미터
   * @returns 주문 응답
   * @throws {KISAPIError} 모의투자 모드이거나 한국 시장인 경우
   */
  async cancelDaytimeOrder(params: { kisOrderId: string; symbol: string; quantity: number; exchangeCode?: 'NASD' | 'NYSE' | 'AMEX'; }): Promise<OrderResponse> {
    // 주간매매는 실거래 + 미국 시장만 지원
    if (this.config.isMock) {
      throw new KISAPIError('주간매매 취소는 모의투자를 지원하지 않습니다.', 400);
    }

    const [accNo, accCode] = this.parseAccountNumber();

    // 종목 코드는 반드시 대문자로 전송 (KIS API 요구사항)
    const symbolUpper = params.symbol.toUpperCase();

    const body = {
      CANO: accNo,
      ACNT_PRDT_CD: accCode,
      OVRS_EXCG_CD: params.exchangeCode || 'NASD', // 거래소 코드 (NASD, NYSE, AMEX)
      PDNO: symbolUpper,
      ORGN_ODNO: params.kisOrderId, // 원주문번호
      RVSE_CNCL_DVSN_CD: '02', // 02: 취소
      ORD_QTY: '0',
      OVRS_ORD_UNPR: '0',
      ORD_SVR_DVSN_CD: '0', // 주문서버구분코드 (0: 해외)
    };

    const path = '/uapi/overseas-stock/v1/trading/daytime-order-rvsecncl';
    const trId = TR_CODES.OVERSEAS_DAYTIME_CANCEL;

    const response = await this._request('POST', path, trId, body) as KISOrderResponse;

    // KIS API 응답 검증
    if (!response || !response.output || !response.output.ODNO) {
      const errorResponse = response as { rt_cd?: string; msg_cd?: string; msg1?: string };
      throw new KISAPIError(
        `주간매매 취소 실패: ${errorResponse?.msg1 || JSON.stringify(response)}`,
        500
      );
    }

    return {
      orderId: response.output.ODNO,
      status: 'CANCELLED',
      message: response.msg1,
    };
  }

  /**
   * 해외주식 계좌 잔고 조회 (예수금, 평가 금액, 손익 등)
   * @returns 해외주식 계좌 잔고 정보
   */
  /**
   * 해외 증거금 통화별 조회
   * @returns 예수금 및 매수가능금액 정보
   */
  async getOverseasDeposit(): Promise<{ deposit: number; buyableCash: number }> {
    // 모의투자는 해외 증거금 조회 미지원
    if (this.config.isMock) {
      console.warn('[KIS API] 해외 증거금 조회는 모의투자를 지원하지 않습니다. 기본값 반환.');
      return { deposit: 0, buyableCash: 0 };
    }

    const path = '/uapi/overseas-stock/v1/trading/foreign-margin';
    const trId = TR_CODES.OVERSEAS_MARGIN;

    const [accNo, accCode] = this.parseAccountNumber();

    const params = {
      CANO: accNo,
      ACNT_PRDT_CD: accCode,
    };

    try {
      const response = await this._request('GET', path, trId, {}, params) as KISOverasDepositResponse;

      if (response.rt_cd !== '0') {
        console.warn(`[KIS API] Failed to fetch foreign margin: ${response.msg1}`);
        return { deposit: 0, buyableCash: 0 };
      }

      const output = response.output;

      // 디버깅: 증거금 조회 응답 로그
      // eslint-disable-next-line no-console
      console.log('[KIS API] US Foreign Margin Response:', JSON.stringify(output, null, 2));

      // USD 통화 찾기
      const usdMargin = output.find(item => item.crcy_cd === 'USD');

      if (!usdMargin) {
        console.warn('[KIS API] USD margin not found in response');
        return { deposit: 0, buyableCash: 0 };
      }

      return {
        deposit: parseFloat(usdMargin.frcr_dncl_amt1 || '0'), // 외화예수금액
        buyableCash: parseFloat(usdMargin.frcr_gnrl_ord_psbl_amt || usdMargin.frcr_ord_psbl_amt1 || '0'), // 외화일반주문가능금액
      };
    } catch (error) {
      console.warn('[KIS API] Error fetching foreign margin, returning 0:', error);
      return { deposit: 0, buyableCash: 0 };
    }
  }

  async getAccountBalance(): Promise<AccountBalance> {
    const path = '/uapi/overseas-stock/v1/trading/inquire-balance';
    // 모의투자/실거래 TR_ID 선택
    const trId = this.config.isMock ? TR_CODES.OVERSEAS_BALANCE_MOCK : TR_CODES.OVERSEAS_BALANCE;

    const [accNo, accCode] = this.parseAccountNumber();

    const params = {
      CANO: accNo,
      ACNT_PRDT_CD: accCode,
      OVRS_EXCG_CD: 'NASD', // NASD: 나스닥, NYSE: 뉴욕, AMEX: 아멕스
      TR_CRCY_CD: 'USD',
      CTX_AREA_FK200: '',
      CTX_AREA_NK200: '',
    };

    try {
      // 1. 잔고 조회
      const response = await this._request('GET', path, trId, {}, params) as KISOverasBalanceResponse;

      if (response.rt_cd !== '0') {
        throw new KISAPIError(`Failed to fetch account balance: ${response.msg1}`, 400);
      }

      const output1 = response.output1;
      const output2 = response.output2;

      // 디버깅: 전체 응답 로그 출력 (모든 필드 확인)
      // eslint-disable-next-line no-console
      console.log('[KIS API] US Balance Full Response:', JSON.stringify(response, null, 2));
      // eslint-disable-next-line no-console
      console.log('[KIS API] US Balance output1 length:', output1?.length || 0);
      // eslint-disable-next-line no-console
      console.log('[KIS API] US Balance output2 keys:', Object.keys(output2));

      // 2. 예수금 및 매수가능금액 조회 (별도 API)
      const depositInfo = await this.getOverseasDeposit();

      // output1에서 보유 종목의 평가금액 합계 계산
      const totalEvaluationAmount = output1?.reduce((sum, holding) => {
        const evalAmount = parseFloat(holding.ovrs_stck_evlu_amt || '0');
        return sum + evalAmount;
      }, 0) || 0;

      const purchaseAmount = parseFloat(output2.frcr_pchs_amt1 || '0');
      // ovrs_tot_pfls가 실제 평가손익 (tot_evlu_pfls_amt는 평가금액 + 실현손익)
      const profitLoss = parseFloat(output2.ovrs_tot_pfls || '0');

      // 평가금액 = output1에서 계산한 값 또는 (매입금액 + 평가손익)
      const evaluationAmount = totalEvaluationAmount || (purchaseAmount + profitLoss);

      // eslint-disable-next-line no-console
      console.log('[KIS API] Calculation - Purchase:', purchaseAmount, 'ProfitLoss:', profitLoss, 'Evaluation:', evaluationAmount, 'TotalEval:', totalEvaluationAmount);

      // 실제 KIS API 필드명에 맞춰 수정
      return {
        foreignCurrency: {
          deposit: depositInfo.deposit, // 별도 API에서 조회
          buyableCash: depositInfo.buyableCash, // 별도 API에서 조회
          purchaseAmount,
          evaluationAmount,
          profitLoss,
          profitLossRate: parseFloat(output2.tot_pftrt || '0'),
          realizedProfitLoss: parseFloat(output2.ovrs_rlzt_pfls_amt || '0'),
        },
      };
    } catch (error) {
      if (error instanceof KISAPIError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new KISAPIError(`Failed to fetch account balance: ${errorMessage}`);
    }
  }

  /**
   * 국내 주식 계좌 잔고 조회
   * @returns 국내주식 계좌 잔고 정보
   */
  async getDomesticAccountBalance(): Promise<AccountBalance> {
    const path = '/uapi/domestic-stock/v1/trading/inquire-balance';
    // 모의투자/실거래 TR_ID 선택
    const trId = this.config.isMock ? TR_CODES.DOMESTIC_BALANCE_MOCK : TR_CODES.DOMESTIC_BALANCE;

    const [accNo, accCode] = this.parseAccountNumber();

    const params = {
      CANO: accNo,
      ACNT_PRDT_CD: accCode,
      AFHR_FLPR_YN: 'N', // 시간외단일가여부
      OFL_YN: '', // 오프라인여부
      INQR_DVSN: '01', // 조회구분(01: 대출일별, 02: 종목별)
      UNPR_DVSN: '01', // 단가구분
      FUND_STTL_ICLD_YN: 'N', // 펀드결제분포함여부
      FNCG_AMT_AUTO_RDPT_YN: 'N', // 융자금액자동상환여부
      PRCS_DVSN: '01', // 처리구분(00: 전일, 01: 금일)
      CTX_AREA_FK100: '', // 연속조회검색조건100
      CTX_AREA_NK100: '', // 연속조회키100
    };

    try {
      const response = await this._request('GET', path, trId, {}, params) as KISDomesticBalanceResponse;

      if (response.rt_cd !== '0') {
        throw new KISAPIError(`Failed to fetch domestic account balance: ${response.msg1}`, 400);
      }

      const output2 = response.output2;

      // 디버깅: 원본 응답 로그 출력
      // eslint-disable-next-line no-console
      console.log('[KIS API] KR Balance output2:', JSON.stringify(output2));

      // output2가 배열로 반환되므로 첫 번째 요소 사용
      const balanceData = Array.isArray(output2) ? output2[0] : output2;

      return {
        domesticCurrency: {
          deposit: parseFloat(balanceData?.dnca_tot_amt || '0'),
          buyableCash: parseFloat(balanceData?.nxdy_excc_amt || '0'), // 수정: nxdy_excc_amt (익일 정산금액)
          purchaseAmount: parseFloat(balanceData?.pchs_amt_smtl_amt || '0'),
          evaluationAmount: parseFloat(balanceData?.evlu_amt_smtl_amt || '0'),
          profitLoss: parseFloat(balanceData?.evlu_pfls_smtl_amt || '0'),
          profitLossRate: balanceData?.evlu_amt_smtl_amt && balanceData?.pchs_amt_smtl_amt && parseFloat(balanceData.pchs_amt_smtl_amt) > 0
            ? (parseFloat(balanceData.evlu_pfls_smtl_amt) / parseFloat(balanceData.pchs_amt_smtl_amt)) * 100
            : 0,
        },
      };
    } catch (error) {
      if (error instanceof KISAPIError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new KISAPIError(`Failed to fetch domestic account balance: ${errorMessage}`);
    }
  }

  async getAccountInfo(): Promise<AccountInfo> {
    // getAccountBalance와 getAccountHoldings를 조합하여 AccountInfo 반환
    const [balance, holdings] = await Promise.all([
      this.getAccountBalance(),
      this.getAccountHoldings(),
    ]);

    return {
      accountNumber: this.config.accountNumber,
      balance: balance.foreignCurrency?.evaluationAmount ?? 0,
      cashAmount: balance.foreignCurrency?.buyableCash ?? 0,
      holdings: holdings,
    };
  }

  async getAccountHoldings(): Promise<KISHolding[]> {
    const path = '/uapi/overseas-stock/v1/trading/inquire-balance';
    const trId = this.config.isMock ? 'VTTS3012R' : 'TTTS3012R'; // 해외주식 잔고조회

    const [accNo, accCode] = this.parseAccountNumber();

    // 미국 주식 거래소 목록 (NASD, NYSE, AMEX 모두 조회)
    const allHoldings: KISHolding[] = [];

    for (const exchange of US_EXCHANGES) {
      const params = {
        CANO: accNo,
        ACNT_PRDT_CD: accCode,
        OVRS_EXCG_CD: exchange,
        TR_CRCY_CD: 'USD',
        CTX_AREA_FK200: '',
        CTX_AREA_NK200: '',
      };

      try {
        const response = await this._request('GET', path, trId, {}, params) as KISOverasBalanceResponse;

        if (response.rt_cd === '0' && response.output1 && Array.isArray(response.output1)) {
          const holdings = response.output1.map(item => ({
            symbol: item.ovrs_pdno,
            name: item.ovrs_item_name || item.item_name || undefined,
            quantity: parseInt(item.ovrs_cblc_qty || item.hldg_qty || '0', 10),
            averagePrice: parseFloat(item.pchs_avg_pric || '0'),
            currentPrice: parseFloat(item.now_pric2 || item.now_pric || '0'),
            valuationPrice: parseFloat(item.ovrs_stck_evlu_amt || item.frcr_evlu_pfls_amt || '0'),
            profitRate: parseFloat(item.evlu_pfls_rt || '0'),
          }));
          allHoldings.push(...holdings);
        }
      } catch (error) {
        // 개별 거래소 조회 실패는 무시하고 계속 진행
        // eslint-disable-next-line no-console
        console.warn(`[getAccountHoldings] ${exchange} 거래소 조회 실패:`, error);
      }
    }

    // 중복 제거 (같은 종목이 여러 거래소에서 반환될 수 있음)
    const uniqueHoldings = allHoldings.filter((holding, index, self) =>
      index === self.findIndex(h => h.symbol === holding.symbol)
    );

    return uniqueHoldings;
  }

  /**
   * 국내 주식 보유 종목 조회
   */
  async getDomesticHoldings(): Promise<KISHolding[]> {
    const path = '/uapi/domestic-stock/v1/trading/inquire-balance';
    const trId = TR_CODES.DOMESTIC_BALANCE;

    const [accNo, accCode] = this.parseAccountNumber();

    const params = {
      CANO: accNo,
      ACNT_PRDT_CD: accCode,
      AFHR_FLPR_YN: 'N',
      OFL_YN: '',
      INQR_DVSN: '02', // 02: 종목별 조회
      UNPR_DVSN: '01',
      FUND_STTL_ICLD_YN: 'N',
      FNCG_AMT_AUTO_RDPT_YN: 'N',
      PRCS_DVSN: '01',
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
    };

    try {
      const response = await this._request('GET', path, trId, {}, params) as KISDomesticBalanceResponse;

      if (response.rt_cd !== '0' || !response.output1 || !Array.isArray(response.output1)) {
        return [];
      }

      return response.output1.map(item => ({
        symbol: item.pdno,
        name: item.prdt_name || undefined,
        quantity: parseInt(item.hldg_qty || '0', 10),
        averagePrice: parseFloat(item.pchs_avg_pric || '0'),
        currentPrice: parseFloat(item.prpr || '0'),
        valuationPrice: parseFloat(item.evlu_pfls_amt || '0') + (parseFloat(item.pchs_avg_pric || '0') * parseInt(item.hldg_qty || '0', 10)),
        profitRate: parseFloat(item.evlu_pfls_rt || '0'),
      }));
    } catch (error) {
      if (error instanceof KISAPIError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new KISAPIError(`Failed to fetch domestic holdings: ${errorMessage}`);
    }
  }

  async getOrderDetail(orderId: string, symbol: string, market: 'US' | 'KR', exchangeCode?: 'NASD' | 'NYSE' | 'AMEX'): Promise<KISOrderDetail> {
    const [accNo, accCode] = this.parseAccountNumber();

    if (market === 'US') {
      // 미국 시장 주문 조회 (해외주식 주문체결내역)
      const path = '/uapi/overseas-stock/v1/trading/inquire-ccnl';
      const trId = this.config.isMock ? 'VTTS3035R' : 'TTTS3035R';

      // 날짜 파라미터 생성 (최근 N일간 조회)
      const today = new Date();
      const daysAgo = new Date(today);
      daysAgo.setDate(today.getDate() - ORDER_HISTORY_DAYS);

      const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
      };

      const params = {
        CANO: accNo,
        ACNT_PRDT_CD: accCode,
        PDNO: symbol,                           // 종목코드 (% = 전체)
        ORD_STRT_DT: formatDate(daysAgo),       // 주문시작일자 (필수)
        ORD_END_DT: formatDate(today),          // 주문종료일자 (필수)
        SLL_BUY_DVSN: '00',                     // 매도매수구분 (00=전체)
        CCLD_NCCS_DVSN: '00',                   // 체결미체결구분 (00=전체)
        OVRS_EXCG_CD: exchangeCode || 'NASD',   // 해외거래소코드
        SORT_SQN: 'DS',                         // 정렬순서 (DS=내림차순)
        ORD_DT: '',                             // 주문일자 (공백=전체)
        ORD_GNO_BRNO: '',                       // 주문채번지점번호 (공백=전체)
        ODNO: orderId,                          // 주문번호
        CTX_AREA_FK200: '',
        CTX_AREA_NK200: '',
      };

      const response = await this._request('GET', path, trId, {}, params) as KISOrderDetailResponse;

      // 주문을 찾을 수 없는 경우 (취소/만료된 주문)
      if (response.rt_cd !== '0') {
        if (response.msg_cd === 'APBK0013' || response.msg1?.includes('조회할 자료가 없습니다')) {
          // 주문이 존재하지 않음 (취소 또는 만료)
          return {
            status: 'CANCELLED',
            filledQuantity: 0,
            avgPrice: 0,
          };
        }
        throw new KISAPIError(`Order detail fetch failed: ${response.msg1} (rt_cd: ${response.rt_cd})`);
      }

      if (!response.output1 || response.output1.length === 0) {
        // 데이터가 없는 경우도 취소로 간주
        return {
          status: 'CANCELLED',
          filledQuantity: 0,
          avgPrice: 0,
        };
      }

      // 주문번호와 일치하는 주문 찾기
      const detail = response.output1.find((item: Record<string, string>) =>
        item.odno === orderId || item.ODNO === orderId
      ) || response.output1[0];

      // Map KIS response to our internal status
      let status: KISOrderDetail['status'] = 'SUBMITTED';
      const totalQty = parseInt(detail.ord_qty, 10);
      const filledQty = parseInt(detail.tot_ccld_qty, 10);

      if (detail.cncl_yn === 'Y') {
        status = 'CANCELLED';
      } else if (filledQty === totalQty && totalQty > 0) {
        status = 'FILLED';
      } else if (filledQty > 0) {
        status = 'PARTIALLY_FILLED';
      }

      return {
        status: status,
        filledQuantity: filledQty,
        avgPrice: parseFloat(detail.avg_prvs) || 0,
      };
    } else {
      // 국내 시장 주문 조회
      const path = '/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl';
      const trId = this.config.isMock ? 'VTTC8036R' : 'TTTC8036R';

      const params = {
        CANO: accNo,
        ACNT_PRDT_CD: accCode,
        CTX_AREA_FK100: '',
        CTX_AREA_NK100: '',
        INQR_DVSN_1: '0',  // 조회구분1 (0: 전체)
        INQR_DVSN_2: '0',  // 조회구분2 (0: 전체)
      };

      const response = await this._request('GET', path, trId, {}, params) as KISDomesticOrderResponse;

      if (response.rt_cd !== '0') {
        if (response.msg_cd === 'APBK0013' || response.msg1?.includes('조회할 자료가 없습니다')) {
          return {
            status: 'CANCELLED',
            filledQuantity: 0,
            avgPrice: 0,
          };
        }
        throw new KISAPIError(`Domestic order detail fetch failed: ${response.msg1} (rt_cd: ${response.rt_cd})`);
      }

      if (!response.output || response.output.length === 0) {
        return {
          status: 'CANCELLED',
          filledQuantity: 0,
          avgPrice: 0,
        };
      }

      // 특정 주문번호와 일치하는 주문 찾기
      const detail = response.output.find((order) => order.odno === orderId);

      if (!detail) {
        return {
          status: 'CANCELLED',
          filledQuantity: 0,
          avgPrice: 0,
        };
      }

      // 국내 주문 상태 매핑
      let status: KISOrderDetail['status'] = 'SUBMITTED';
      const totalQty = parseInt(detail.ord_qty || '0', 10);
      const filledQty = parseInt(detail.tot_ccld_qty || '0', 10);

      // 주문 상태 코드 확인 (cncl_yn: 취소여부)
      if (detail.cncl_yn === 'Y' || detail.ord_stat_cd === '02') {
        status = 'CANCELLED';
      } else if (filledQty === totalQty && totalQty > 0) {
        status = 'FILLED';
      } else if (filledQty > 0) {
        status = 'PARTIALLY_FILLED';
      }

      return {
        status: status,
        filledQuantity: filledQty,
        avgPrice: parseFloat(detail.avg_prvs || '0'),
      };
    }
  }

  async getStockPrice(symbol: string): Promise<StockPrice> {
    const path = '/uapi/domestic-stock/v1/quotations/inquire-price';
    const trId = TR_CODES.INQUIRE_PRICE;

    const params = {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: symbol,
    };

    const response = await this._request('GET', path, trId, {}, params) as KISPriceResponse;
    return response.output as unknown as StockPrice;
  }

  async getOverseasStockPrice(symbol: string, exchange: string = 'NAS'): Promise<{ output: { last: string } }> {
    const path = '/uapi/overseas-price/v1/quotations/price';
    const trId = TR_CODES.INQUIRE_OVERSEAS_PRICE;

    const params = {
      AUTH: '',
      EXCD: exchange,
      SYMB: symbol,
    };

    const response = await this._request('GET', path, trId, {}, params) as { output: { last: string } };
    return response;
  }

  /**
   * 해외 주식 상세 시세 조회 (LOO/LOC 전략용)
   * 현재가, 전일종가, 시가 등 모든 시세 정보를 반환합니다.
   * @param symbol 종목코드 (예: AAPL, TSLA)
   * @param exchange 거래소코드 (NAS: 나스닥, NYS: 뉴욕, AMS: 아멕스)
   * @returns OverseasStockPrice 해외 주식 상세 시세 정보
   */
  async getOverseasStockPriceDetail(symbol: string, exchange: string = 'NAS'): Promise<OverseasStockPrice> {
    const path = '/uapi/overseas-price/v1/quotations/price';
    const trId = TR_CODES.INQUIRE_OVERSEAS_PRICE;

    const params = {
      AUTH: '',
      EXCD: exchange,
      SYMB: symbol.toUpperCase(),
    };

    try {
      const response = await this._request('GET', path, trId, {}, params) as KISOverseasPriceResponse;

      if (response.rt_cd !== '0') {
        throw new KISAPIError(`해외 주식 시세 조회 실패: ${response.msg1}`, 400);
      }

      const output = response.output;

      // KIS API 응답을 OverseasStockPrice 타입으로 변환
      return {
        currentPrice: parseFloat(output.last || '0'),
        previousClose: parseFloat(output.base || '0'),
        openingPrice: parseFloat(output.open || '0'),
        highPrice: parseFloat(output.high || '0'),
        lowPrice: parseFloat(output.low || '0'),
        volume: parseInt(output.tvol || '0', 10),
        change: parseFloat(output.diff || '0'),
        changeRate: parseFloat(output.rate || '0'),
      };
    } catch (error) {
      if (error instanceof KISAPIError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new KISAPIError(`해외 주식 시세 조회 중 오류: ${errorMessage}`);
    }
  }

  async getCurrentPrices(symbols: { symbol: string, exchange: string }[]): Promise<PriceData> {
    const prices: PriceData = {};
    for (const item of symbols) {
      try {
        await this.sleep(KIS_REQUEST_DELAY_MS);
        const priceInfo = await this.getOverseasStockPrice(item.symbol, item.exchange);
        if (priceInfo.output && priceInfo.output.last) {
          prices[item.symbol] = parseFloat(priceInfo.output.last);
        } else {
          prices[item.symbol] = 0;
        }
      } catch (priceError) {
        // 개별 종목 가격 조회 실패 시 0으로 설정하고 계속 진행
        // eslint-disable-next-line no-console
        console.warn(`[getCurrentPrices] Failed to fetch price for ${item.symbol}:`, priceError instanceof Error ? priceError.message : priceError);
        prices[item.symbol] = 0;
      }
    }
    return prices;
  }

  /**
   * 해외 주식 미체결 주문 조회 (특정 종목)
   * @param symbol 종목코드 (예: AAPL, TSLA)
   * @param exchangeCode 거래소 코드 (NASD, NYSE, AMEX)
   * @returns 미체결 주문 목록
   */
  async getOverseasUnfilledOrders(symbol?: string, exchangeCode: 'NASD' | 'NYSE' | 'AMEX' = 'NASD'): Promise<{
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: string;
    quantity: number;
    price: number;
    unfilledQuantity: number;
    orderTime: string;
  }[]> {
    // 모의투자는 미체결 조회 API 미지원
    if (this.config.isMock) {
      console.log('[KISClient] getOverseasUnfilledOrders: 모의투자는 미지원, 빈 배열 반환');
      return [];
    }

    const [accNo, accCode] = this.parseAccountNumber();
    const trId = TR_CODES.OVERSEAS_UNFILLED;
    const path = '/uapi/overseas-stock/v1/trading/inquire-nccs';

    const params: Record<string, string> = {
      CANO: accNo,
      ACNT_PRDT_CD: accCode,
      OVRS_EXCG_CD: exchangeCode,
      SORT_SQN: 'DS', // 정렬순서 (DS: 정순)
      CTX_AREA_FK200: '', // 연속조회검색조건
      CTX_AREA_NK200: '', // 연속조회키
    };

    try {
      const response = await this._request('GET', path, trId, {}, params) as {
        output: Array<{
          odno: string;           // 주문번호
          pdno: string;           // 종목코드
          ovrs_excg_cd: string;   // 거래소코드
          sll_buy_dvsn_cd: string; // 매도매수구분 (01: 매도, 02: 매수)
          ord_dvsn_cd?: string;   // 주문구분 (00: 지정가, 32: LOO, 34: LOC 등) - 일부 응답에서 누락될 수 있음
          sll_buy_dvsn_cd_name?: string; // 주문구분명 (LOO매수, LOC매수 등)
          ft_ord_qty: string;     // 주문수량
          ft_ord_unpr3: string;   // 주문단가
          nccs_qty: string;       // 미체결수량
          ord_tmd: string;        // 주문시간
          prcs_stat_name: string; // 처리상태명
        }>;
      };

      if (!response.output || response.output.length === 0) {
        return [];
      }

      // 특정 종목 필터링 (symbol이 제공된 경우)
      let orders = response.output;
      if (symbol) {
        orders = orders.filter(o => o.pdno && o.pdno.toUpperCase() === symbol.toUpperCase());
      }

      return orders
        .filter(o => o.odno && o.pdno) // 필수 필드가 있는 주문만
        .map(o => ({
          orderId: o.odno,
          symbol: o.pdno,
          side: o.sll_buy_dvsn_cd === '02' ? 'BUY' : 'SELL' as 'BUY' | 'SELL',
          orderType: this.parseOrderTypeFromName(o.sll_buy_dvsn_cd_name || '', o.ord_dvsn_cd),
          quantity: parseInt(o.ft_ord_qty || '0', 10),
          price: parseFloat(o.ft_ord_unpr3 || '0'),
          unfilledQuantity: parseInt(o.nccs_qty || '0', 10),
          orderTime: o.ord_tmd || '',
        }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[KISClient] getOverseasUnfilledOrders failed: ${errorMessage}`);
      return [];
    }
  }

  /**
   * 주문구분코드를 읽기 쉬운 형태로 변환
   */
  private parseOrderTypeCode(code: string): string {
    const types: Record<string, string> = {
      '00': 'LIMIT',
      '01': 'MARKET',
      '32': 'LOO',
      '34': 'LOC',
    };
    return types[code] || code;
  }

  /**
   * 주문구분명(sll_buy_dvsn_cd_name)에서 주문 타입 추출
   * 예: "LOO매수" -> "LOO", "LOC매도" -> "LOC", "지정가매수" -> "LIMIT"
   */
  private parseOrderTypeFromName(name: string, code?: string): string {
    // 먼저 이름에서 추출 시도
    if (name.includes('LOO')) return 'LOO';
    if (name.includes('LOC')) return 'LOC';
    if (name.includes('시장가')) return 'MARKET';
    if (name.includes('지정가')) return 'LIMIT';

    // 이름으로 판단 못하면 코드로 시도
    if (code) {
      return this.parseOrderTypeCode(code);
    }

    return name || 'UNKNOWN';
  }

  async getPendingOrders(): Promise<Order[]> {
    // 기존 호환성을 위해 유지 (사용하지 않음)
    return Promise.resolve([]);
  }

  async getFilledOrders(): Promise<Order[]> {
    // TODO: 체결 내역 조회 로직 구현
    return Promise.resolve([]);
  }
}