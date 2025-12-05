'use client';

import { useState, useEffect } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountBalance, KISHolding } from '@/lib/kis/types';
import { BalanceStatCard } from '@/components/common/BalanceStatCard';
import { HoldingsTable } from './HoldingsTable';

export function AccountInfo() {
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [holdings, setHoldings] = useState<{ us: KISHolding[]; kr: KISHolding[] }>({
    us: [],
    kr: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMarket, setActiveMarket] = useState<'US' | 'KR'>('US');

  const fetchAccountData = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const balanceResponse = await fetch('/api/account/balance');
      const balanceData = await balanceResponse.json();

      if (!balanceResponse.ok) {
        throw new Error(balanceData.error || '잔고 조회 실패');
      }

      setBalance(balanceData.data);

      const holdingsResponse = await fetch('/api/account/holdings');
      const holdingsData = await holdingsResponse.json();

      if (!holdingsResponse.ok) {
        throw new Error(holdingsData.error || '보유 종목 조회 실패');
      }

      setHoldings(holdingsData.data || { us: [], kr: [] });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '계좌 정보 조회 중 오류가 발생했습니다.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountData();
  }, []);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-destructive">{error}</p>
        <p className="text-sm text-muted-foreground">
          KIS API 자격증명을 먼저 등록해주세요.
        </p>
      </div>
    );
  }

  const formatUSD = (value: number | undefined): string => {
    return `$${(value ?? 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatKRW = (value: number | undefined): string => {
    return `₩${(value ?? 0).toLocaleString('ko-KR')}`;
  };

  const formatRate = (value: number | undefined): string => {
    const rate = value ?? 0;
    return `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* 잔고 정보 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">계좌 잔고</h3>
            <p className="text-sm text-muted-foreground">시장별 예수금 및 평가 정보</p>
          </div>
          <Button variant="outline" size="icon" onClick={fetchAccountData} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {loading && !balance ? (
          <p className="text-muted-foreground">로딩 중...</p>
        ) : (
          <Tabs value={activeMarket} onValueChange={(v) => setActiveMarket(v as 'US' | 'KR')}>
            <TabsList className="mb-4">
              <TabsTrigger value="US">미국 시장 (USD)</TabsTrigger>
              <TabsTrigger value="KR">한국 시장 (KRW)</TabsTrigger>
            </TabsList>

            <TabsContent value="US">
              {balance?.foreignCurrency ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <BalanceStatCard
                    label="예수금"
                    value={formatUSD(balance.foreignCurrency.deposit)}
                    variant="primary"
                  />
                  <BalanceStatCard
                    label="매수가능금액"
                    value={formatUSD(balance.foreignCurrency.buyableCash)}
                    variant="success"
                  />
                  <BalanceStatCard
                    label="매입금액"
                    value={formatUSD(balance.foreignCurrency.purchaseAmount)}
                    variant="warning"
                  />
                  <BalanceStatCard
                    label="평가금액"
                    value={formatUSD(balance.foreignCurrency.evaluationAmount)}
                    variant="default"
                  />
                  <BalanceStatCard
                    label="평가손익"
                    value={formatUSD(balance.foreignCurrency.profitLoss)}
                    subValue={formatRate(balance.foreignCurrency.profitLossRate)}
                    variant={
                      (balance.foreignCurrency.profitLoss ?? 0) >= 0 ? 'success' : 'destructive'
                    }
                  />
                </div>
              ) : (
                <p className="text-muted-foreground">
                  미국 시장 계좌 정보를 불러오지 못했습니다.
                </p>
              )}
            </TabsContent>

            <TabsContent value="KR">
              {balance?.domesticCurrency ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <BalanceStatCard
                    label="예수금"
                    value={formatKRW(balance.domesticCurrency.deposit)}
                    variant="primary"
                  />
                  <BalanceStatCard
                    label="매수가능금액"
                    value={formatKRW(balance.domesticCurrency.buyableCash)}
                    variant="success"
                  />
                  <BalanceStatCard
                    label="매입금액"
                    value={formatKRW(balance.domesticCurrency.purchaseAmount)}
                    variant="warning"
                  />
                  <BalanceStatCard
                    label="평가금액"
                    value={formatKRW(balance.domesticCurrency.evaluationAmount)}
                    variant="default"
                  />
                  <BalanceStatCard
                    label="평가손익"
                    value={formatKRW(balance.domesticCurrency.profitLoss)}
                    subValue={formatRate(balance.domesticCurrency.profitLossRate)}
                    variant={
                      (balance.domesticCurrency.profitLoss ?? 0) >= 0 ? 'success' : 'destructive'
                    }
                  />
                </div>
              ) : (
                <p className="text-muted-foreground">
                  한국 시장 계좌 정보를 불러오지 못했습니다.
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* 보유 종목 */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">보유 종목</h3>
          <p className="text-sm text-muted-foreground">시장별 보유 종목 정보</p>
        </div>

        {loading && holdings.us.length === 0 && holdings.kr.length === 0 ? (
          <p className="text-muted-foreground">로딩 중...</p>
        ) : (
          <Tabs value={activeMarket} onValueChange={(v) => setActiveMarket(v as 'US' | 'KR')}>
            <TabsList className="mb-4">
              <TabsTrigger value="US">미국 시장 ({holdings.us.length})</TabsTrigger>
              <TabsTrigger value="KR">한국 시장 ({holdings.kr.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="US">
              <HoldingsTable holdings={holdings.us} market="US" />
            </TabsContent>

            <TabsContent value="KR">
              <HoldingsTable holdings={holdings.kr} market="KR" />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
