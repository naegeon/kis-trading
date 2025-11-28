import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';

// TR 코드 검증용 임시 엔드포인트 - 프로덕션 배포 전 삭제 필요
export const dynamic = 'force-dynamic';

interface TestResult {
  name: string;
  trCode: string;
  path: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  data?: unknown;
}

export async function GET() {
  const results: TestResult[] = [];

  try {
    const userCredentials = await db.query.credentials.findFirst();

    if (!userCredentials) {
      return NextResponse.json({ error: 'No credentials found' }, { status: 404 });
    }

    const decryptedCreds = getDecryptedCredentials(userCredentials);
    const kisClient = new KISClient({
      appkey: decryptedCreds.appKey,
      appsecret: decryptedCreds.appSecret,
      isMock: decryptedCreds.isMock,
      accountNumber: decryptedCreds.accountNumber,
      credentialsId: decryptedCreds.credentialsId,
    });

    const isMock = decryptedCreds.isMock;

    // ==============================
    // 1. 해외주식 (미국) - 조회 API
    // ==============================

    // 1.1 해외주식 잔고 조회
    try {
      const trCode = isMock ? 'VTTS3012R' : 'TTTS3012R';
      const holdings = await kisClient.getAccountHoldings();
      results.push({
        name: '해외주식 잔고조회',
        trCode,
        path: '/uapi/overseas-stock/v1/trading/inquire-balance',
        status: 'success',
        message: `${holdings.length}개 종목 보유`,
        data: holdings.slice(0, 3), // 최대 3개만
      });
    } catch (error) {
      results.push({
        name: '해외주식 잔고조회',
        trCode: isMock ? 'VTTS3012R' : 'TTTS3012R',
        path: '/uapi/overseas-stock/v1/trading/inquire-balance',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 1.2 해외주식 미체결 조회 (실거래만)
    if (!isMock) {
      try {
        const unfilled = await kisClient.getOverseasUnfilledOrders();
        results.push({
          name: '해외주식 미체결조회',
          trCode: 'TTTS3018R',
          path: '/uapi/overseas-stock/v1/trading/inquire-nccs',
          status: 'success',
          message: `${unfilled.length}건 미체결`,
          data: unfilled.slice(0, 3),
        });
      } catch (error) {
        results.push({
          name: '해외주식 미체결조회',
          trCode: 'TTTS3018R',
          path: '/uapi/overseas-stock/v1/trading/inquire-nccs',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      results.push({
        name: '해외주식 미체결조회',
        trCode: 'TTTS3018R',
        path: '/uapi/overseas-stock/v1/trading/inquire-nccs',
        status: 'skipped',
        message: '모의투자 미지원',
      });
    }

    // 1.3 해외주식 시세 조회
    try {
      const quote = await kisClient.getOverseasStockPriceDetail('AAPL', 'NAS');
      results.push({
        name: '해외주식 시세조회',
        trCode: isMock ? 'VHST0001R' : 'HHDFS76200200',
        path: '/uapi/overseas-stock/v1/quotations/price',
        status: 'success',
        message: `AAPL 현재가: $${quote.currentPrice}`,
        data: quote,
      });
    } catch (error) {
      results.push({
        name: '해외주식 시세조회',
        trCode: isMock ? 'VHST0001R' : 'HHDFS76200200',
        path: '/uapi/overseas-stock/v1/quotations/price',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 1.4 해외 예수금 조회 (실거래만 - TTTC2101R)
    if (!isMock) {
      try {
        const deposit = await kisClient.getOverseasDeposit();
        results.push({
          name: '해외 예수금(증거금) 조회',
          trCode: 'TTTC2101R',
          path: '/uapi/overseas-stock/v1/trading/inquire-psamount',
          status: 'success',
          message: `USD 예수금: $${deposit.deposit?.toLocaleString() ?? 0}`,
          data: deposit,
        });
      } catch (error) {
        results.push({
          name: '해외 예수금(증거금) 조회',
          trCode: 'TTTC2101R',
          path: '/uapi/overseas-stock/v1/trading/inquire-psamount',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      results.push({
        name: '해외 예수금(증거금) 조회',
        trCode: 'TTTC2101R',
        path: '/uapi/overseas-stock/v1/trading/inquire-psamount',
        status: 'skipped',
        message: '모의투자 미지원',
      });
    }

    // ==============================
    // 2. 국내주식 - 조회 API
    // ==============================

    // 2.1 국내주식 잔고 조회
    try {
      const trCode = isMock ? 'VTTC8434R' : 'TTTC8434R';
      const balance = await kisClient.getDomesticAccountBalance();
      const deposit = balance.domesticCurrency?.deposit ?? 0;
      const buyableCash = balance.domesticCurrency?.buyableCash ?? 0;
      results.push({
        name: '국내주식 잔고조회',
        trCode,
        path: '/uapi/domestic-stock/v1/trading/inquire-balance',
        status: 'success',
        message: `예수금: ${deposit.toLocaleString()}원, 매수가능: ${buyableCash.toLocaleString()}원`,
        data: balance.domesticCurrency,
      });
    } catch (error) {
      results.push({
        name: '국내주식 잔고조회',
        trCode: isMock ? 'VTTC8434R' : 'TTTC8434R',
        path: '/uapi/domestic-stock/v1/trading/inquire-balance',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 2.2 국내주식 보유종목 조회
    try {
      const trCode = isMock ? 'VTTC8434R' : 'TTTC8434R';
      const holdings = await kisClient.getDomesticHoldings();
      results.push({
        name: '국내주식 보유종목조회',
        trCode,
        path: '/uapi/domestic-stock/v1/trading/inquire-balance',
        status: 'success',
        message: `${holdings.length}개 종목 보유`,
        data: holdings.slice(0, 3),
      });
    } catch (error) {
      results.push({
        name: '국내주식 보유종목조회',
        trCode: isMock ? 'VTTC8434R' : 'TTTC8434R',
        path: '/uapi/domestic-stock/v1/trading/inquire-balance',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // ==============================
    // 3. TR 코드 목록 (참조용)
    // ==============================
    const trCodeReference = {
      // === 해외주식 (미국) 정규장 ===
      '해외주식_매수': { real: 'TTTT1002U', mock: 'VTTT1002U', description: '정규장 매수' },
      '해외주식_매도': { real: 'TTTT1006U', mock: 'VTTT1001U', description: '정규장 매도' },
      '해외주식_취소': { real: 'TTTT1004U', mock: 'VTTT1004U', description: '정규장 정정/취소' },
      '해외주식_잔고': { real: 'TTTS3012R', mock: 'VTTS3012R', description: '보유종목 조회' },
      '해외주식_미체결': { real: 'TTTS3018R', mock: '미지원', description: '미체결 주문 조회' },
      '해외주식_체결내역': { real: 'TTTS3035R', mock: 'VTTS3035R', description: '체결 내역 조회' },
      '해외주식_예수금': { real: 'TTTC2101R', mock: '미지원', description: '증거금/예수금 조회' },
      '해외주식_시세': { real: 'HHDFS76200200', mock: 'VHST0001R', description: '현재가 시세 조회' },

      // === 해외주식 (미국) 주간장 ===
      '해외주식_주간매수': { real: 'TTTS6036U', mock: '미지원', description: '주간장 매수' },
      '해외주식_주간매도': { real: 'TTTS6037U', mock: '미지원', description: '주간장 매도' },
      '해외주식_주간취소': { real: 'TTTS6038U', mock: '미지원', description: '주간장 정정/취소' },

      // === 국내주식 ===
      '국내주식_매수': { real: 'TTTC0012U', mock: 'VTTC0012U', description: '매수 주문' },
      '국내주식_매도': { real: 'TTTC0011U', mock: 'VTTC0011U', description: '매도 주문' },
      '국내주식_취소': { real: 'TTTC0013U', mock: 'VTTC0013U', description: '정정/취소' },
      '국내주식_잔고': { real: 'TTTC8434R', mock: 'VTTC8434R', description: '잔고/보유종목 조회' },
      '국내주식_시세': { real: 'FHKST01010100', mock: 'FHKST01010100', description: '현재가 시세 조회' },
    };

    return NextResponse.json({
      success: true,
      isMock,
      timestamp: new Date().toISOString(),
      results,
      trCodeReference,
      summary: {
        total: results.length,
        success: results.filter(r => r.status === 'success').length,
        error: results.filter(r => r.status === 'error').length,
        skipped: results.filter(r => r.status === 'skipped').length,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}
