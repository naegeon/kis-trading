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
  const [initialBuyEnabled, setInitialBuyEnabled] = useState(true);

  type LooLocStrategyValues = z.infer<typeof looLocStrategySchema>;

  const form = useForm<LooLocStrategyValues>({
    resolver: zodResolver(looLocStrategySchema),
    defaultValues: {
      market: "US",
      symbol: "",
      initialBuyQty: 10,
      initialBuyPrice: 0,
      looEnabled: false,
      looQty: 5,
      locBuyEnabled: false,
      locBuyQty: 3,
      targetReturnRate: 10,
      startDate: null,
      endDate: null,
    },
  });

  // Load initial data when editing
  useEffect(() => {
    if (initialData?.parameters) {
      const params = initialData.parameters as LooLocStrategyParams;
      const initialQty = params.initialBuyQty || 0;

      setInitialBuyEnabled(initialQty > 0);

      form.reset({
        market: initialData.market || "US",
        symbol: initialData.symbol,
        initialBuyQty: initialQty,
        initialBuyPrice: params.initialBuyPrice || 0,
        looEnabled: params.looEnabled || false,
        looQty: params.looQty || 5,
        locBuyEnabled: params.locBuyEnabled || false,
        locBuyQty: params.locBuyQty || 3,
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
      // 최초 매수가 비활성화되면 수량을 0으로 설정
      const submitValues = {
        ...values,
        initialBuyQty: initialBuyEnabled ? values.initialBuyQty : 0,
      };

      const url = strategyId ? `/api/strategies/${strategyId}` : "/api/strategies/loo-loc";
      const method = strategyId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitValues),
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

        {/* 최초 매수 활성화 체크박스 */}
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="initialBuyEnabled"
              checked={initialBuyEnabled}
              onCheckedChange={(checked) => setInitialBuyEnabled(checked as boolean)}
              disabled={isLoading}
            />
            <div className="space-y-1">
              <label
                htmlFor="initialBuyEnabled"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                최초 매수 활성화
              </label>
              <p className="text-sm text-muted-foreground">
                전략 시작 시 시장가로 즉시 매수합니다. (선택사항)
              </p>
            </div>
          </div>

          {initialBuyEnabled && (
            <div className="ml-6 space-y-4">
              <FormField
                control={form.control}
                name="initialBuyQty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>최초 매수 수량 (주)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="10"
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value, 10))}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="initialBuyPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>최초 매수 지정가 (USD)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="100.00"
                        step="0.01"
                        {...field}
                        onChange={e => field.onChange(parseFloat(e.target.value))}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormDescription>
                      프리마켓/정규장/애프터마켓에서 이 가격 이하로 매수합니다. (지정가 당일 유효)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
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
