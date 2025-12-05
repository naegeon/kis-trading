"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { splitOrderStrategySchema } from "@/lib/validations/strategy";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SymbolSearch } from "@/components/common/SymbolSearch";
import type { Strategy } from "@/types/strategy";
import type { SplitOrderParams } from "@/types/strategy";

export function SplitOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const strategyId = searchParams.get("id");

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type SplitOrderStrategyValues = z.infer<typeof splitOrderStrategySchema>;

  const form = useForm<SplitOrderStrategyValues>({
    resolver: zodResolver(splitOrderStrategySchema),
    defaultValues: {
      market: "US",
      symbol: "",
      basePrice: 0,
      totalQuantity: 10,
      orderCount: 2,
      orderType: "buy",
      priceChange: 0,
      priceChangeType: "PERCENT",
      distribution: "EQUAL",
      targetReturnRate: 10,
    },
  });

  // Watch market field to update currency display
  const selectedMarket = form.watch("market");

  // Get currency symbol based on market
  const getCurrencySymbol = (market: string) => {
    if (market === 'KR') return '₩';
    return '$'; // US and US_DAYTIME both use USD
  };

  // Load existing strategy data if editing
  useEffect(() => {
    if (!strategyId) return;

    async function fetchStrategy() {
      setIsFetching(true);
      try {
        const response = await fetch(`/api/strategies/${strategyId}`);
        if (!response.ok) {
          throw new Error('전략을 불러오는데 실패했습니다');
        }
        const result = await response.json();
        if (result.success && result.data) {
          const strategy = result.data as Strategy;
          const params = strategy.parameters as SplitOrderParams;

          // Convert SplitOrderParams back to form values
          // Check isDaytime flag to determine if it's US_DAYTIME
          const formMarket = params.isDaytime
            ? 'US_DAYTIME'
            : strategy.market as "US" | "KR" | "US_DAYTIME";

          form.reset({
            market: formMarket,
            symbol: strategy.symbol,
            basePrice: params.basePrice,
            totalQuantity: params.totalAmount,
            orderCount: params.splitCount,
            orderType: params.side.toLowerCase() as "buy" | "sell",
            priceChange: params.declineValue,
            priceChangeType: params.declineUnit === 'PERCENT' ? 'PERCENT' : 'AMOUNT',
            distribution: params.distributionType === 'PYRAMID'
              ? 'TRIANGULAR'
              : params.distributionType === 'INVERTED'
              ? 'INVERTED_TRIANGULAR'
              : 'EQUAL',
            targetReturnRate: params.targetReturnRate || 10,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '전략을 불러오는데 실패했습니다';
        setError(message);
        toast({
          title: "에러",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsFetching(false);
      }
    }

    fetchStrategy();
  }, [strategyId, form]);

  async function onSubmit(values: SplitOrderStrategyValues) {
    setIsLoading(true);
    setError(null);

    try {
      const url = strategyId
        ? `/api/strategies/split-order/${strategyId}`
        : "/api/strategies/split-order";
      const method = strategyId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "An unexpected error occurred.");
      }

      toast({
        title: "성공",
        description: strategyId ? "전략이 수정되었습니다." : "전략이 생성되었습니다.",
      });

      router.push("/strategies");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(message);
      toast({
        title: "에러",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }


  if (isFetching) {
    return <div className="text-center py-12">전략 정보를 불러오는 중...</div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="market"
          render={({ field }) => (
            <FormItem>
              <FormLabel>시장 선택</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="시장을 선택하세요" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="US">미국 시장 (정규장)</SelectItem>
                  <SelectItem value="US_DAYTIME">미국 시장 (주간장)</SelectItem>
                  <SelectItem value="KR">한국 시장</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedMarket === 'US_DAYTIME' && '주간장: 한국시간 10:00~18:00 (모의투자 미지원)'}
                {selectedMarket === 'US' && '정규장: 한국시간 23:30~06:00 (Summer Time: 22:30~05:00)'}
                {selectedMarket === 'KR' && '정규장: 09:00~15:30'}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>종목 검색</FormLabel>
              <FormControl>
                <SymbolSearch
                  value={field.value}
                  onValueChange={field.onChange}
                  market={selectedMarket === 'US_DAYTIME' ? 'US' : selectedMarket as 'US' | 'KR'}
                  placeholder="종목 코드 또는 이름 입력 (예: AAPL, Apple)"
                  disabled={isLoading || isFetching}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
                <FormField
          control={form.control}
          name="basePrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>기준가</FormLabel>
              <FormControl>
                <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value))}/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="totalQuantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>총 매수 수량 (주)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="50"
                  {...field}
                  onChange={e => field.onChange(parseInt(e.target.value, 10))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="orderCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>주문 횟수 (분할 횟수)</FormLabel>
              <FormControl>
                <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10))}/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="orderType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>주문 유형</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="주문 유형을 선택하세요" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="buy">매수</SelectItem>
                  <SelectItem value="sell">매도</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="priceChange"
          render={({ field }) => (
            <FormItem>
              <FormLabel>가격 변동폭</FormLabel>
              <FormControl>
                <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value))}/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="priceChangeType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>가격 변동 유형</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="가격 변동 유형을 선택하세요" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PERCENT">비율 (%)</SelectItem>
                  <SelectItem value="AMOUNT">금액 ({getCurrencySymbol(selectedMarket)})</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="distribution"
          render={({ field }) => (
            <FormItem>
              <FormLabel>분배 방식</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="분배 방식을 선택하세요" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="EQUAL">균등</SelectItem>
                  <SelectItem value="TRIANGULAR">삼각형</SelectItem>
                  <SelectItem value="INVERTED_TRIANGULAR">역삼각형</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="targetReturnRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>목표 수익률 (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="10"
                  {...field}
                  onChange={e => field.onChange(parseFloat(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (strategyId ? "수정 중..." : "생성 중...") : (strategyId ? "전략 수정" : "전략 생성")}
          </Button>
          {strategyId && (
            <Button type="button" variant="outline" onClick={() => router.push("/strategies")} disabled={isLoading}>
              취소
            </Button>
          )}
        </div>

        {error && <p className="text-red-500">{error}</p>}
      </form>
    </Form>
  );
}
