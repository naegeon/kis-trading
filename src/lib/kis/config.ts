import { KISConfig } from './types';

// KIS API 엔드포인트
const KIS_REAL_API_URL = 'https://openapi.koreainvestment.com:9443';
const KIS_MOCK_API_URL = 'https://openapivts.koreainvestment.com:29443';

// KIS API TR 코드 (Transaction Code)
// 실제 필요한 TR 코드들을 여기에 추가합니다.
export const TR_CODES = {
  // 주식 주문
  ORDER_CASH_BUY: 'TTTC0802U', // 현금 매수
  ORDER_CASH_SELL: 'TTTC0801U', // 현금 매도
  ORDER_CANCEL: 'TTTC0803U', // 정정/취소

  // 계좌 정보
  GET_ACCOUNT_BALANCE: 'TTTC8434R', // 잔고 조회
  GET_PENDING_ORDERS: 'TTTC8049R', // 미체결 조회
  GET_FILLED_ORDERS: 'TTTC8049R', // 체결내역 조회 (미체결과 동일한 tr_id 사용, 구분자로 구분)

  // 시세 정보
  GET_CURRENT_PRICE: 'HHDFS00000300', // 현재가 조회
};

/**
 * 설정 객체를 기반으로 KIS API의 기본 URL을 반환합니다.
 * @param isMock - 모의투자 여부
 * @returns KIS API 기본 URL
 */
export const getKISApiUrl = (isMock: boolean): string => {
  return isMock ? KIS_MOCK_API_URL : KIS_REAL_API_URL;
};

/**
 * KIS API 설정을 가져오는 함수 (환경변수 등에서)
 * 실제 구현에서는 환경변수나 DB에서 키를 가져와야 합니다.
 * @param isMock - 모의투자 여부
 * @returns KISConfig 객체
 */
export const getKISConfig = (isMock: boolean, accountNumber: string): KISConfig => {
  // 중요: 실제 프로덕션에서는 환경변수나 안전한 저장소에서 키를 로드해야 합니다.
  const appkey = isMock ? process.env.KIS_MOCK_APP_KEY : process.env.KIS_REAL_APP_KEY;
  const appsecret = isMock ? process.env.KIS_MOCK_APP_SECRET : process.env.KIS_REAL_APP_SECRET;

  if (!appkey || !appsecret) {
    throw new Error('KIS App Key or App Secret is not defined in environment variables.');
  }

  if (!accountNumber) {
    throw new Error('Account number is not provided.');
  }

  return {
    appkey,
    appsecret,
    isMock,
    accountNumber,
  };
};
