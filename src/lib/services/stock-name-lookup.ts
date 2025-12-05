/**
 * KIS 마스터 파일에서 종목명을 조회하는 서비스
 *
 * KIS에서 제공하는 마스터 파일 다운로드:
 * https://new.real.download.dws.co.kr/common/master/{exchange}mst.cod.zip
 * - nas = NASDAQ
 * - nys = NYSE
 * - ams = AMEX
 */

import { db } from '@/lib/db/client';
import { stockSymbols } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// 거래소 코드 매핑
const EXCHANGE_FILE_CODES: Record<string, string> = {
  NASD: 'nas',
  NYSE: 'nys',
  AMEX: 'ams',
};

// 마스터 파일 컬럼 인덱스 (0-based)
// 파일 형식: Symbol, Korea name, English name, ...
const MASTER_FILE_COLUMNS = {
  SYMBOL: 0,
  KOREA_NAME: 1,
  ENGLISH_NAME: 2,
};

interface StockNameResult {
  symbol: string;
  koreaName: string | null;
  englishName: string | null;
}

/**
 * KIS 마스터 파일에서 종목명을 조회합니다.
 *
 * @param symbol 종목코드 (예: AAPL)
 * @param exchangeCode 거래소코드 (NASD, NYSE, AMEX)
 * @returns 종목명 정보 또는 null
 */
export async function lookupStockName(
  symbol: string,
  exchangeCode: 'NASD' | 'NYSE' | 'AMEX'
): Promise<StockNameResult | null> {
  const symbolUpper = symbol.toUpperCase();
  const fileCode = EXCHANGE_FILE_CODES[exchangeCode];

  if (!fileCode) {
    console.error(`Unknown exchange code: ${exchangeCode}`);
    return null;
  }

  try {
    // 마스터 파일 다운로드 URL
    const url = `https://new.real.download.dws.co.kr/common/master/${fileCode}mst.cod.zip`;

    // zip 파일 다운로드
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Failed to download master file: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    // zip 파일 압축 해제 (Node.js 환경에서)
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 첫 번째 파일 읽기
    const fileNames = Object.keys(zip.files);
    if (fileNames.length === 0) {
      console.error('Empty zip file');
      return null;
    }

    const content = await zip.files[fileNames[0]].async('string');
    const lines = content.split('\n');

    // 종목 검색
    for (const line of lines) {
      const columns = line.split('|');
      if (columns.length > MASTER_FILE_COLUMNS.ENGLISH_NAME) {
        const fileSymbol = columns[MASTER_FILE_COLUMNS.SYMBOL]?.trim();
        if (fileSymbol === symbolUpper) {
          return {
            symbol: symbolUpper,
            koreaName: columns[MASTER_FILE_COLUMNS.KOREA_NAME]?.trim() || null,
            englishName: columns[MASTER_FILE_COLUMNS.ENGLISH_NAME]?.trim() || null,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error looking up stock name:', error);
    return null;
  }
}

/**
 * 종목명을 DB에 업데이트합니다.
 */
export async function updateStockNameInDB(
  symbol: string,
  market: 'US' | 'KR',
  name: string
): Promise<void> {
  try {
    const existing = await db.query.stockSymbols.findFirst({
      where: and(
        eq(stockSymbols.symbol, symbol.toUpperCase()),
        eq(stockSymbols.market, market)
      ),
    });

    if (existing) {
      await db
        .update(stockSymbols)
        .set({ name, updatedAt: new Date() })
        .where(eq(stockSymbols.id, existing.id));
    }
  } catch (error) {
    console.error('Error updating stock name in DB:', error);
  }
}

/**
 * 인기 미국 종목 목록 (하드코딩)
 */
const POPULAR_US_STOCKS: Record<string, string> = {
  // ETF
  SOXL: 'Direxion Daily Semiconductor Bull 3X',
  SOXS: 'Direxion Daily Semiconductor Bear 3X',
  TQQQ: 'ProShares UltraPro QQQ',
  SQQQ: 'ProShares UltraPro Short QQQ',
  SPXL: 'Direxion Daily S&P 500 Bull 3X',
  SPXS: 'Direxion Daily S&P 500 Bear 3X',
  UPRO: 'ProShares UltraPro S&P500',
  LABU: 'Direxion Daily S&P Biotech Bull 3X',
  LABD: 'Direxion Daily S&P Biotech Bear 3X',
  TECL: 'Direxion Daily Technology Bull 3X',
  TECS: 'Direxion Daily Technology Bear 3X',
  FAS: 'Direxion Daily Financial Bull 3X',
  FAZ: 'Direxion Daily Financial Bear 3X',
  TNA: 'Direxion Daily Small Cap Bull 3X',
  TZA: 'Direxion Daily Small Cap Bear 3X',
  FNGU: 'MicroSectors FANG+ Index 3X',
  FNGD: 'MicroSectors FANG+ Index -3X',
  BULZ: 'MicroSectors Solactive FANG & Innovation 3X',
  BERZ: 'MicroSectors Solactive FANG & Innovation -3X',
  YINN: 'Direxion Daily FTSE China Bull 3X',
  YANG: 'Direxion Daily FTSE China Bear 3X',
  NUGT: 'Direxion Daily Gold Miners Bull 2X',
  DUST: 'Direxion Daily Gold Miners Bear 2X',
  JNUG: 'Direxion Daily Junior Gold Miners Bull 2X',
  JDST: 'Direxion Daily Junior Gold Miners Bear 2X',
  TMF: 'Direxion Daily 20+ Year Treasury Bull 3X',
  TMV: 'Direxion Daily 20+ Year Treasury Bear 3X',
  TSLT: 'T-Rex 2X Long Tesla Daily Target',
  TSLL: 'Direxion Daily TSLA Bull 2X',
  NVDL: 'GraniteShares 2x Long NVDA Daily ETF',
  CONL: 'GraniteShares 2x Long COIN Daily ETF',

  // 인기 주식
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  GOOGL: 'Alphabet Inc. Class A',
  GOOG: 'Alphabet Inc. Class C',
  AMZN: 'Amazon.com Inc.',
  NVDA: 'NVIDIA Corporation',
  META: 'Meta Platforms Inc.',
  TSLA: 'Tesla Inc.',
  AMD: 'Advanced Micro Devices Inc.',
  NFLX: 'Netflix Inc.',
  INTC: 'Intel Corporation',
  QCOM: 'Qualcomm Inc.',
  AVGO: 'Broadcom Inc.',
  COST: 'Costco Wholesale Corporation',
  PEP: 'PepsiCo Inc.',
  CSCO: 'Cisco Systems Inc.',
  ADBE: 'Adobe Inc.',
  CRM: 'Salesforce Inc.',
  ORCL: 'Oracle Corporation',
  IBM: 'International Business Machines',
  MU: 'Micron Technology Inc.',
  MRVL: 'Marvell Technology Inc.',
  AMAT: 'Applied Materials Inc.',
  LRCX: 'Lam Research Corporation',
  KLAC: 'KLA Corporation',
  SNPS: 'Synopsys Inc.',
  CDNS: 'Cadence Design Systems',
  ASML: 'ASML Holding N.V.',
  TSM: 'Taiwan Semiconductor Mfg.',

  // 기타 인기 종목
  IONQ: 'IonQ Inc.',
  PLTR: 'Palantir Technologies Inc.',
  RIVN: 'Rivian Automotive Inc.',
  LCID: 'Lucid Group Inc.',
  NIO: 'NIO Inc.',
  XPEV: 'XPeng Inc.',
  LI: 'Li Auto Inc.',
  BABA: 'Alibaba Group Holding',
  JD: 'JD.com Inc.',
  PDD: 'PDD Holdings Inc.',
  BIDU: 'Baidu Inc.',
  COIN: 'Coinbase Global Inc.',
  MSTR: 'MicroStrategy Inc.',
  HOOD: 'Robinhood Markets Inc.',
  SQ: 'Block Inc.',
  PYPL: 'PayPal Holdings Inc.',
  SHOP: 'Shopify Inc.',
  SPOT: 'Spotify Technology S.A.',
  SNOW: 'Snowflake Inc.',
  DDOG: 'Datadog Inc.',
  NET: 'Cloudflare Inc.',
  ZS: 'Zscaler Inc.',
  CRWD: 'CrowdStrike Holdings Inc.',
  PANW: 'Palo Alto Networks Inc.',
  FTNT: 'Fortinet Inc.',
  OKTA: 'Okta Inc.',
  TDOC: 'Teladoc Health Inc.',
  ROKU: 'Roku Inc.',
  U: 'Unity Software Inc.',
  RBLX: 'Roblox Corporation',
  ABNB: 'Airbnb Inc.',
  UBER: 'Uber Technologies Inc.',
  LYFT: 'Lyft Inc.',
  DASH: 'DoorDash Inc.',
  SNAP: 'Snap Inc.',
  PINS: 'Pinterest Inc.',
  TWLO: 'Twilio Inc.',
  ZM: 'Zoom Video Communications',
  DOCU: 'DocuSign Inc.',
  MNDY: 'monday.com Ltd.',
  TEAM: 'Atlassian Corporation',
  MDB: 'MongoDB Inc.',
  ESTC: 'Elastic N.V.',
  PATH: 'UiPath Inc.',
  AI: 'C3.ai Inc.',
  BBAI: 'BigBear.ai Holdings Inc.',
  SMCI: 'Super Micro Computer Inc.',
  ARM: 'Arm Holdings plc',

  // 배당주
  VZ: 'Verizon Communications',
  T: 'AT&T Inc.',
  KO: 'The Coca-Cola Company',
  JNJ: 'Johnson & Johnson',
  PG: 'Procter & Gamble Co.',
  XOM: 'Exxon Mobil Corporation',
  CVX: 'Chevron Corporation',

  // 금융
  JPM: 'JPMorgan Chase & Co.',
  BAC: 'Bank of America Corp.',
  WFC: 'Wells Fargo & Company',
  C: 'Citigroup Inc.',
  GS: 'The Goldman Sachs Group',
  MS: 'Morgan Stanley',
  V: 'Visa Inc.',
  MA: 'Mastercard Inc.',
  AXP: 'American Express Company',

  // 헬스케어
  UNH: 'UnitedHealth Group Inc.',
  PFE: 'Pfizer Inc.',
  MRK: 'Merck & Co. Inc.',
  ABBV: 'AbbVie Inc.',
  LLY: 'Eli Lilly and Company',
  NVO: 'Novo Nordisk A/S',
  MRNA: 'Moderna Inc.',
  BNTX: 'BioNTech SE',

  // 소매
  WMT: 'Walmart Inc.',
  TGT: 'Target Corporation',
  HD: 'The Home Depot Inc.',
  LOW: "Lowe's Companies Inc.",
  NKE: 'Nike Inc.',
  SBUX: 'Starbucks Corporation',
  MCD: "McDonald's Corporation",

  // 산업
  BA: 'The Boeing Company',
  CAT: 'Caterpillar Inc.',
  DE: 'Deere & Company',
  HON: 'Honeywell International',
  UPS: 'United Parcel Service',
  FDX: 'FedEx Corporation',

  // 엔터테인먼트
  DIS: 'The Walt Disney Company',
  WBD: 'Warner Bros. Discovery',
  PARA: 'Paramount Global',
  CMCSA: 'Comcast Corporation',
};

/**
 * 인기 한국 종목 목록 (하드코딩)
 * 종목코드 6자리로 조회
 */
const POPULAR_KR_STOCKS: Record<string, string> = {
  // 대형주 (시가총액 상위)
  '005930': '삼성전자',
  '000660': 'SK하이닉스',
  '373220': 'LG에너지솔루션',
  '207940': '삼성바이오로직스',
  '005935': '삼성전자우',
  '005380': '현대차',
  '000270': '기아',
  '006400': '삼성SDI',
  '051910': 'LG화학',
  '035420': 'NAVER',
  '035720': '카카오',
  '005490': 'POSCO홀딩스',
  '068270': '셀트리온',
  '105560': 'KB금융',
  '055550': '신한지주',
  '012330': '현대모비스',
  '003670': '포스코퓨처엠',
  '028260': '삼성물산',
  '066570': 'LG전자',
  '096770': 'SK이노베이션',
  '034730': 'SK',
  '003550': 'LG',
  '032830': '삼성생명',
  '086790': '하나금융지주',
  '017670': 'SK텔레콤',
  '030200': 'KT',
  '018260': '삼성에스디에스',
  '000810': '삼성화재',
  '010130': '고려아연',
  '090430': '아모레퍼시픽',
  '051900': 'LG생활건강',
  '011200': 'HMM',
  '033780': 'KT&G',
  '009150': '삼성전기',
  '024110': '기업은행',
  '316140': '우리금융지주',
  '259960': '크래프톤',
  '352820': '하이브',
  '034020': '두산에너빌리티',
  '010950': 'S-Oil',
  '009540': '한국조선해양',
  '036570': '엔씨소프트',
  '015760': '한국전력',
  '329180': '현대중공업',
  '000720': '현대건설',
  '047050': '포스코인터내셔널',
  '326030': 'SK바이오팜',
  '011170': '롯데케미칼',
  '010140': '삼성중공업',
  '009830': '한화솔루션',

  // 2차전지/반도체
  '247540': '에코프로비엠',
  '086520': '에코프로',
  '006280': '녹십자',
  '006800': '미래에셋증권',
  '267250': '현대에너지솔루션',
  '064350': '현대로템',
  '377300': '카카오페이',
  '293490': '카카오게임즈',
  '241560': '두산밥캣',
  '042660': '한화오션',
  '011790': 'SKC',
  '078930': 'GS',
  '402340': 'SK스퀘어',
  '138040': '메리츠금융지주',
  '003490': '대한항공',
  '000100': '유한양행',
  '004020': '현대제철',
  '011070': 'LG이노텍',
  '016360': '삼성증권',
  '003410': '쌍용C&E',
  '267260': '현대일렉트릭',
  '028050': '삼성엔지니어링',
  '088350': '한화생명',
  '021240': '코웨이',

  // 코스닥 주요 종목
  '091990': '셀트리온헬스케어',
  '068760': '셀트리온제약',
  '041510': 'SM',
  '035900': 'JYP Ent.',
  '122870': 'YG PLUS',
  '112040': '위메이드',
  '263750': '펄어비스',
  '041960': '코미팜',
  '145020': '휴젤',
  '357780': '솔브레인',
  '348210': '넥스틴',
  '196170': '알테오젠',
  '039030': '이오테크닉스',
  '086900': '메디톡스',
  '067160': '아프리카TV',
  '214150': '클래시스',
  '131970': '테스나',
  '058470': '리노공업',
  '095340': 'ISC',
  '383310': '에코프로에이치엔',
  '069960': '현대백화점',
  '004370': '농심',
  '018880': '한온시스템',
  '000150': '두산',
  '161390': '한국타이어앤테크놀로지',
  '004990': '롯데지주',
  '282330': 'BGF리테일',
  '069620': '대웅제약',
  '012750': '에스원',
  '032640': 'LG유플러스',
  '272210': '한화시스템',
  '008770': '호텔신라',
  '034220': 'LG디스플레이',
  '004800': '효성',
  '036460': '한국가스공사',
  '071050': '한국금융지주',
};

/**
 * 캐시된 인기 종목에서 종목명을 조회합니다.
 * 마스터 파일 다운로드보다 빠릅니다.
 *
 * @param symbol 종목코드 (미국: 티커, 한국: 6자리 코드)
 * @param market 시장 (US 또는 KR)
 */
export function getPopularStockName(symbol: string, market: 'US' | 'KR' = 'US'): string | null {
  if (market === 'KR') {
    // 한국 주식은 6자리 숫자 코드
    const normalizedSymbol = symbol.padStart(6, '0');
    return POPULAR_KR_STOCKS[normalizedSymbol] || null;
  }
  // 미국 주식은 대문자 티커
  return POPULAR_US_STOCKS[symbol.toUpperCase()] || null;
}

/**
 * 종목명을 조회합니다 (캐시 → 마스터 파일 순서)
 *
 * @param symbol 종목코드
 * @param exchangeCode 거래소코드 (미국만 해당)
 * @param market 시장 (US 또는 KR)
 */
export async function getStockName(
  symbol: string,
  exchangeCode?: 'NASD' | 'NYSE' | 'AMEX',
  market: 'US' | 'KR' = 'US'
): Promise<string | null> {
  // 1. 먼저 인기 종목 캐시에서 조회
  const cachedName = getPopularStockName(symbol, market);
  if (cachedName) {
    return cachedName;
  }

  // 2. 마스터 파일에서 조회 (미국 주식, exchangeCode가 있는 경우)
  if (market === 'US' && exchangeCode) {
    try {
      const result = await lookupStockName(symbol, exchangeCode);
      if (result?.englishName) {
        return result.englishName;
      }
    } catch {
      // 마스터 파일 조회 실패 시 무시
    }
  }

  // 한국 주식은 마스터 파일 조회가 복잡하므로 (cp949 인코딩 등)
  // 캐시에 없으면 null 반환 (추후 확장 가능)

  return null;
}
