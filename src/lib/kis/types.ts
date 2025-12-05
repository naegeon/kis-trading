/**
 * KIS API의 기본 설정을 위한 인터페이스
 */
export interface KISConfig {
  appkey: string;
  appsecret: string;
  isMock: boolean;
  accountNumber: string;
  credentialsId?: string; // DB 토큰 캐싱용 (선택)
}

/**
 * 주문 API 호출 시 필요한 파라미터 인터페이스
 */
export interface OrderParams {
  accountNumber?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'MARKET' | 'LOO' | 'LOC';
  quantity: number;
  price?: number;
  market: 'US' | 'KR'; // 시장 구분 (미국 주식 / 한국 주식)
  exchangeCode?: 'NASD' | 'NYSE' | 'AMEX'; // 거래소 코드 (미국 시장만 해당, 기본값: NASD)
}

/**
 * KIS API 주문 응답의 기본 구조
 */
export interface OrderResponse {
  // 한국투자증권 API 응답에 따라 필드 정의 필요
  // 예시:
  orderId: string;
  status: string;
  message: string;
}

/**
 * 계좌 정보 인터페이스
 */
export interface AccountInfo {
  accountNumber: string;
  balance: number;
  cashAmount: number; // 현금 잔고
  holdings: KISHolding[];
}

/**
 * 계좌 잔고 정보 (가공된 형태)
 */
export interface AccountBalance {
  // 외화 정보 (USD) - 미국 시장
  foreignCurrency?: {
    deposit: number; // 예수금
    buyableCash: number; // 매수 가능 금액
    purchaseAmount: number; // 매입 금액
    evaluationAmount: number; // 평가 금액
    profitLoss: number; // 평가 손익
    profitLossRate: number; // 수익률 (%)
    realizedProfitLoss: number; // 실현 손익
  };
  // 원화 정보 (KRW) - 한국 시장
  domesticCurrency?: {
    deposit: number; // 예수금
    buyableCash: number; // 매수 가능 금액
    purchaseAmount: number; // 매입 금액
    evaluationAmount: number; // 평가 금액
    profitLoss: number; // 평가 손익
    profitLossRate: number; // 수익률 (%)
  };
}

/**
 * 보유 종목 정보 인터페이스
 */
export interface KISHolding {
  symbol: string;
  name?: string; // 종목명 (선택적)
  quantity: number;
  averagePrice: number; // 평균 매입가
  currentPrice: number; // 현재가
  valuationPrice: number; // 평가 금액
  profitRate: number; // 수익률
}


/**
 * 주식 현재가 정보 인터페이스
 */
export interface StockPrice {
  stck_prpr: string; // 주식 현재가
  prdy_vrss: string; // 전일 대비
  prdy_vrss_sign: string; // 전일 대비 부호
  prdy_ctrt: string; // 전일 대비율
  stck_oprc: string; // 주식 시가
  stck_hgpr: string; // 주식 최고가
  stck_lwpr: string; // 주식 최저가
  stck_prdy_clpr: string; // 주식 전일 종가
  hts_kor_isnm?: string; // 한글 종목명 (Phase 2 - Task 2.2)
}

export interface KISQuoteResponse {
  output: StockPrice;
}

/**
 * 해외 주식 현재가 정보 인터페이스 (KIS API HHDFS00000300)
 * LOO/LOC 전략에서 사용
 */
export interface OverseasStockPrice {
  currentPrice: number;      // last - 현재가
  previousClose: number;     // base - 전일종가
  openingPrice: number;      // open - 시가
  highPrice: number;         // high - 고가
  lowPrice: number;          // low - 저가
  volume: number;            // tvol - 거래량
  change: number;            // diff - 전일대비
  changeRate: number;        // rate - 등락률
}

/**
 * KIS 해외주식 현재가 API 원본 응답 (HHDFS00000300)
 */
export interface KISOverseasPriceResponse {
  output: {
    last: string;            // 현재가
    base: string;            // 전일종가
    open: string;            // 시가
    high: string;            // 고가
    low: string;             // 저가
    tvol: string;            // 거래량
    diff: string;            // 전일대비
    rate: string;            // 등락률
    sign: string;            // 전일대비부호 (1:상한, 2:상승, 3:보합, 4:하락, 5:하한)
    // 추가 필드들 (필요시 사용)
    ordy?: string;           // 매수가능여부
    rsym?: string;           // 실시간조회종목코드
  };
  rt_cd: string;
  msg1: string;
  msg_cd: string;
}

export type PriceData = {
  [symbol: string]: number;
};

export interface KISOverasBalanceResponse {
  output1: {
    ovrs_pdno: string; // 종목코드
    ovrs_item_name?: string; // 종목명 (해외종목명)
    item_name?: string; // 종목명 (대체 필드)
    ovrs_cblc_qty?: string; // 해외잔고수량
    hldg_qty: string; // 보유수량
    pchs_avg_pric: string; // 매입평균가
    now_pric: string; // 현재가 (deprecated, now_pric2 사용)
    now_pric2?: string; // 현재가
    ovrs_stck_evlu_amt?: string; // 해외주식평가금액
    frcr_evlu_pfls_amt: string; // 외화평가손익금액
    evlu_pfls_rt: string; // 평가손익률
  }[];
  output2: {
    frcr_pchs_amt1: string; // 외화 매입 금액
    ovrs_rlzt_pfls_amt: string; // 해외 실현 손익 금액
    ovrs_rlzt_pfls_amt2?: string; // 해외 실현 손익 금액2
    ovrs_tot_pfls?: string; // 해외 총 평가손익 (실제 평가손익)
    frcr_evlu_amt2?: string; // 외화 평가 금액
    tot_evlu_amt?: string; // 총 평가 금액 (대체 필드)
    tot_evlu_pfls_amt: string; // 총 평가 손익 금액 (평가금액 관련)
    evlu_pfls_rt1?: string; // 평가 손익률
    rlzt_erng_rt?: string; // 실현 수익률
    tot_pftrt: string; // 총 수익률
    frcr_buy_psbl_amt1?: string; // 외화 매수 가능 금액 (deprecated)
    frcr_buy_amt_smtl1: string; // 외화 매수금액합계 (실제 사용)
    frcr_buy_amt_smtl2?: string; // 외화 매수금액합계2
  };
  output3?: {
    frcr_dncl_amt_2?: string; // 외화 예수금
  };
  rt_cd: string;
  msg1: string;
  msg_cd: string;
}

/**
 * 해외 증거금 통화별 조회 응답
 */
export interface KISOverasDepositResponse {
  output: {
    natn_name: string; // 국가명
    crcy_cd: string; // 통화코드
    frcr_dncl_amt1: string; // 외화예수금액
    ustl_buy_amt: string; // 미결제매수금액
    ustl_sll_amt: string; // 미결제매도금액
    frcr_rcvb_amt: string; // 외화미수금액
    frcr_mgn_amt: string; // 외화증거금액
    frcr_gnrl_ord_psbl_amt: string; // 외화일반주문가능금액
    frcr_ord_psbl_amt1: string; // 외화주문가능금액 (원화주문가능환산금액)
    itgr_ord_psbl_amt: string; // 통합주문가능금액
    bass_exrt: string; // 기준환율
  }[];
  rt_cd: string;
  msg1: string;
  msg_cd: string;
}

export interface KISOrderDetail {
  status: 'SUBMITTED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'FAILED';
  filledQuantity: number;
  avgPrice: number;
}

export interface KISOrderDetailResponse {
  output1: {
    ord_no: string;
    ord_dt: string;
    ord_gno_brno: string;
    odno: string;
    ord_dvsn_nm: string;
    sll_buy_dvsn_cd: string;
    pdno: string;
    ord_qty: string;
    ord_unpr: string;
    ord_tmd: string;
    tot_ccld_qty: string;
    avg_prvs: string;
    cncl_yn: string;
    tot_ccld_amt: string;
    rmn_qty: string;
  }[];
  rt_cd: string;
  msg1: string;
  msg_cd:string;
}

/**
 * 국내 주식 주문 조회 응답
 */
export interface KISDomesticOrderResponse {
  output: {
    odno: string; // 주문번호
    ord_dt: string; // 주문일자
    ord_qty: string; // 주문수량
    tot_ccld_qty: string; // 총체결수량
    avg_prvs: string; // 평균가
    cncl_yn: string; // 취소여부
    ord_stat_cd: string; // 주문상태코드
  }[];
  rt_cd: string;
  msg1: string;
  msg_cd: string;
}

/**
 * 국내 주식 잔고 조회 응답
 */
export interface KISDomesticBalanceResponse {
  output1: {
    pdno: string; // 종목코드
    prdt_name?: string; // 종목명
    hldg_qty: string; // 보유수량
    pchs_avg_pric: string; // 매입평균가격
    prpr: string; // 현재가
    evlu_pfls_amt: string; // 평가손익금액
    evlu_pfls_rt: string; // 평가손익율
  }[];
  output2: {
    dnca_tot_amt: string; // 예수금총액
    nxdy_excc_amt: string; // 익일정산금액(D+1 예수금)
    prvs_rcdl_excc_amt: string; // 가수도정산금액(D+2 예수금)
    cma_evlu_amt: string; // CMA평가금액
    ord_psbl_cash?: string; // 주문가능현금 (deprecated)
    pchs_amt_smtl_amt: string; // 매입금액합계금액
    evlu_amt_smtl_amt: string; // 평가금액합계금액
    evlu_pfls_smtl_amt: string; // 평가손익합계금액
    tot_evlu_amt: string; // 총평가금액
  } | {
    dnca_tot_amt: string;
    nxdy_excc_amt: string;
    prvs_rcdl_excc_amt: string;
    cma_evlu_amt: string;
    ord_psbl_cash?: string;
    pchs_amt_smtl_amt: string;
    evlu_amt_smtl_amt: string;
    evlu_pfls_smtl_amt: string;
    tot_evlu_amt: string;
  }[]; // 배열 또는 객체 모두 허용
  rt_cd: string;
  msg1: string;
  msg_cd: string;
}
