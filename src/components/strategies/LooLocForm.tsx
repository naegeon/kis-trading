import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { looLocStrategySchema } from "@/lib/validations/strategy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SymbolSearch } from "@/components/common/SymbolSearch";
import { z } from "zod";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRouter } from 'next/navigation';
import type { Strategy, LooLocStrategyParams } from '@/types/strategy';

interface LooLocFormProps {
  strategyId?: string | null;
  initialData?: Strategy | null;
}

export function LooLocForm({ strategyId, initialData }: LooLocFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  type LooLocStrategyValues = z.infer<typeof looLocStrategySchema>;

  const form = useForm<LooLocStrategyValues>({
    resolver: zodResolver(looLocStrategySchema),
    defaultValues: {
      market: "US",
      symbol: "",
      looEnabled: true,  // 기본으로 LOO 활성화
      looQty: 1,
      locBuyEnabled: true,  // 기본으로 LOC도 활성화
      locBuyQty: 1,
      targetReturnRate: 10,
      startDate: null,
      endDate: null,
    },
  });

  // Load initial data when editing
  useEffect(() => {
    if (initialData?.parameters) {
      const params = initialData.parameters as LooLocStrategyParams;

      form.reset({
        market: initialData.market || "US",
        symbol: initialData.symbol,
        looEnabled: params.looEnabled ?? true,
        looQty: params.looQty || 1,
        locBuyEnabled: params.locBuyEnabled ?? true,
        locBuyQty: params.locBuyQty || 1,
        targetReturnRate: params.targetReturnRate || 10,
        startDate: initialData.startDate ? new Date(initialData.startDate) : null,
        endDate: initialData.endDate ? new Date(initialData.endDate) : null,
      });
    }
  }, [initialData, form]);

  async function onSubmit(values: LooLocStrategyValues) {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const url = strategyId ? `/api/strategies/${strategyId}` : "/api/strategies/loo-loc";
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
        // Handle Zod validation errors (array of error objects)
        if (Array.isArray(result.error)) {
          const errorMessages = result.error.map((e: { path: (string | number)[]; message: string }) => `${e.path.join('.')}: ${e.message}`).join(', ');
          throw new Error(errorMessages);
        }
        throw new Error(result.error || "An unexpected error occurred.");
      }

      setSuccess(true);

      // Redirect to strategies list after 1 second
      setTimeout(() => {
        router.push('/strategies');
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="시장을 선택하세요" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="US">미국 시장 (USD)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                LOO/LOC 전략은 미국 시장에서만 지원됩니다.
              </FormDescription>
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
                  market="US"
                  placeholder="예: AAPL, TSLA, SOXL"
                  disabled={isLoading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* LOO/LOC 매수 설명 */}
        <div className="rounded-lg border p-4 bg-muted/50">
          <p className="text-sm text-muted-foreground">
            <strong>앞뒤로 전략</strong>: 계좌에 해당 종목이 없으면 LOO(전일 종가 기준 갭하락 시)로 매수를 시도하고,
            LOO 미체결 시 LOC(당일 음봉 시)로 매수합니다. 보유 중이면 평단가 기준으로 LOO/LOC 매수를 진행합니다.
          </p>
        </div>

        <FormField
          control={form.control}
          name="looEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isLoading}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  LOO (Limit-on-Open) 매수 활성화
                </FormLabel>
                <FormDescription>
                  시초가가 전일 종가보다 낮을 때 매수합니다.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        {form.watch("looEnabled") && (
          <FormField
            control={form.control}
            name="looQty"
            render={({ field }) => (
              <FormItem className="ml-8">
                <FormLabel>LOO 매수 수량 (주)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="5"
                    {...field}
                    onChange={e => field.onChange(parseInt(e.target.value, 10))}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="locBuyEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isLoading}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  LOC (Limit-on-Close) 추가 매수 활성화
                </FormLabel>
                <FormDescription>
                  종가가 평단가보다 낮을 때 추가 매수합니다. (보유 수량이 0일 때는 전일 종가 기준)
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        {form.watch("locBuyEnabled") && (
          <FormField
            control={form.control}
            name="locBuyQty"
            render={({ field }) => (
              <FormItem className="ml-8">
                <FormLabel>LOC 매수 수량 (주)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="3"
                    {...field}
                    onChange={e => field.onChange(parseInt(e.target.value, 10))}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
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
                  step="0.1"
                  {...field}
                  onChange={e => field.onChange(parseFloat(e.target.value))}
                  disabled={isLoading}
                />
              </FormControl>
              <FormDescription>
                평단가 대비 목표 수익률에 도달하면 전량 매도합니다.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>시작일 (선택)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isLoading}
                      >
                        {field.value ? (
                          format(field.value, "yyyy-MM-dd")
                        ) : (
                          <span>날짜 선택</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value || undefined}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date < new Date(new Date().setHours(0, 0, 0, 0))
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  이 날짜부터 전략을 실행합니다.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>종료일 (선택)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isLoading}
                      >
                        {field.value ? (
                          format(field.value, "yyyy-MM-dd")
                        ) : (
                          <span>날짜 선택</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value || undefined}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date < new Date(new Date().setHours(0, 0, 0, 0))
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  이 날짜에 전략을 종료합니다.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {error && (
          <div className="text-red-500 text-sm">{error}</div>
        )}

        {success && (
          <div className="text-green-500 text-sm">전략이 성공적으로 {strategyId ? '수정' : '생성'}되었습니다!</div>
        )}

        <div className="flex gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "처리 중..." : strategyId ? "전략 수정" : "전략 생성"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/strategies')}
            disabled={isLoading}
          >
            취소
          </Button>
        </div>
      </form>
    </Form>
  );
}
