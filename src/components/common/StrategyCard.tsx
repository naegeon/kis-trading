'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Strategy, SplitOrderParams, LooLocStrategyParams, StrategyWithDetails } from '@/types/strategy';
import { STRATEGY_TYPE_LABELS } from '@/lib/constants/strategy';
import {
  Calendar,
  Layers,
  DollarSign,
  Edit,
  Trash2,
  Play,
  Clock,
  CheckCircle2,
  BarChart3,
  Target,
  Package,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { deleteStrategy, updateStrategyStatus } from '@/lib/api/strategy';

interface StrategyCardProps {
  strategy: Strategy | StrategyWithDetails;
  variant?: 'default' | 'compact';
  showActions?: boolean;
  onMutate?: () => void;
}

export function StrategyCard({
  strategy,
  variant = 'default',
  showActions = false,
  onMutate,
}: StrategyCardProps) {
  const [isActive, setIsActive] = useState(strategy.status === 'ACTIVE');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // 종목명 가져오기 (StrategyWithDetails 타입 확인)
  const symbolName = (strategy as StrategyWithDetails).symbolName;

  const handleStatusToggle = async (checked: boolean): Promise<void> => {
    if (!showActions) return;

    const newStatus = checked ? 'ACTIVE' : 'INACTIVE';
    try {
      await updateStrategyStatus(strategy.id, newStatus);
      setIsActive(checked);
      toast({
        title: '성공',
        description: `전략이 ${newStatus === 'ACTIVE' ? '활성화' : '비활성화'}되었습니다.`,
      });
      onMutate?.();
    } catch (error) {
      console.error(error);
      toast({
        title: '에러',
        description: '전략 상태 변경에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      await deleteStrategy(strategy.id);
      toast({
        title: '성공',
        description: '전략이 삭제되었습니다.',
      });
      onMutate?.();
    } catch (error) {
      console.error(error);
      toast({
        title: '에러',
        description: '전략 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecuteNow = async (): Promise<void> => {
    setIsExecuting(true);
    try {
      const response = await fetch(`/api/strategies/${strategy.id}/execute`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: '성공',
          description: data.message || '전략이 즉시 실행되었습니다.',
        });
        onMutate?.();
      } else {
        throw new Error(data.message || '실행에 실패했습니다.');
      }
    } catch (error) {
      console.error(error);
      toast({
        title: '실행 실패',
        description: error instanceof Error ? error.message : '전략 실행에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const editUrl =
    strategy.type === 'LOO_LOC'
      ? `/strategies/loo-loc?id=${strategy.id}`
      : `/strategies/split-order?id=${strategy.id}`;

  const getCurrencySymbol = (market: string): string => (market === 'KR' ? '₩' : '$');

  const formatPrice = (price: number, market: string): string => {
    const currency = getCurrencySymbol(market);
    return market === 'KR'
      ? `${currency}${price.toLocaleString('ko-KR')}`
      : `${currency}${price.toFixed(2)}`;
  };

  // 전략 타입 레이블은 중앙 상수 사용
  const typeMap = STRATEGY_TYPE_LABELS;

  const statusConfig: Record<
    string,
    { label: string; variant: 'default' | 'secondary' | 'outline'; className: string }
  > = {
    ACTIVE: { label: '활성', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
    INACTIVE: { label: '비활성', variant: 'secondary', className: '' },
    ENDED: { label: '종료', variant: 'outline', className: '' },
  };

  const marketMap: Record<string, string> = {
    US: '미국',
    KR: '한국',
  };

  // 마지막 실행 시간 포맷팅
  const formatLastExecuted = (): { text: string; isRecent: boolean } | null => {
    if (!strategy.lastExecutedAt) return null;

    const lastExec = new Date(strategy.lastExecutedAt);
    const now = new Date();
    const diffMs = now.getTime() - lastExec.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) {
      return { text: '방금 전', isRecent: true };
    } else if (diffMinutes < 60) {
      return { text: `${diffMinutes}분 전`, isRecent: diffMinutes < 15 };
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return { text: `${hours}시간 전`, isRecent: false };
    } else {
      const days = Math.floor(diffMinutes / 1440);
      return { text: `${days}일 전`, isRecent: false };
    }
  };

  // 기간 진행률 계산 (LOO/LOC)
  const calculatePeriodProgress = (): number | null => {
    if (!strategy.startDate || !strategy.endDate) return null;

    const start = new Date(strategy.startDate).getTime();
    const end = new Date(strategy.endDate).getTime();
    const now = new Date().getTime();

    if (now < start) return 0;
    if (now > end) return 100;

    return Math.round(((now - start) / (end - start)) * 100);
  };

  // 현재 성과 정보 가져오기
  const getPerformanceInfo = (): { avgCost: number | null; qty: number | null; targetReturn: number | null } => {
    const params = strategy.parameters as SplitOrderParams | LooLocStrategyParams;
    return {
      avgCost: params.currentAvgCost ?? null,
      qty: params.currentQty ?? null,
      targetReturn: params.targetReturnRate ?? null,
    };
  };

  const performance = getPerformanceInfo();
  const lastExecuted = formatLastExecuted();
  const periodProgress = calculatePeriodProgress();

  // 전략 세부 정보 렌더링
  const renderDetails = (): JSX.Element | null => {
    if (strategy.type === 'LOO_LOC') {
      const params = strategy.parameters as LooLocStrategyParams;
      const conditions = [params.looEnabled && 'LOO', params.locBuyEnabled && 'LOC 매수']
        .filter(Boolean)
        .join(', ');

      return (
        <>
          {/* 목표 수익률 - 강조 */}
          <div className="flex justify-between items-center py-1.5 px-2 bg-green-500/10 rounded-md">
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-green-500" />
              목표 수익률
            </dt>
            <dd className="font-bold text-lg text-green-500">{params.targetReturnRate ?? 0}%</dd>
          </div>

          <div className="flex justify-between items-center">
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              매매 조건
            </dt>
            <dd className="font-medium text-sm">{conditions || '없음'}</dd>
          </div>

          {strategy.startDate && strategy.endDate && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  기간
                </dt>
                <dd className="font-medium text-sm">
                  {new Date(strategy.startDate).toLocaleDateString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' ~ '}
                  {new Date(strategy.endDate).toLocaleDateString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </dd>
              </div>
              {periodProgress !== null && (
                <div className="space-y-1">
                  <Progress value={periodProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground text-right">{periodProgress}% 진행</p>
                </div>
              )}
            </div>
          )}
        </>
      );
    } else if (strategy.type === 'SPLIT_ORDER') {
      const params = strategy.parameters as SplitOrderParams;
      const distributionMap: Record<string, string> = {
        EQUAL: '균등',
        PYRAMID: '삼각형',
        INVERTED: '역삼각형',
      };

      return (
        <>
          {/* 기준가 - 강조 */}
          <div className="flex justify-between items-center py-1.5 px-2 bg-blue-500/10 rounded-md">
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-blue-500" />
              기준가
            </dt>
            <dd className="font-bold text-lg text-blue-500">
              {formatPrice(params.basePrice ?? 0, strategy.market)}
            </dd>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground flex items-center gap-1">
                <Layers className="h-3 w-3" />
                주문
              </dt>
              <dd className="font-medium text-sm">{params.splitCount ?? 0}회</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" />
                수량
              </dt>
              <dd className="font-medium text-sm">{params.totalAmount ?? 0}주</dd>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <dt className="text-muted-foreground">분배 방식</dt>
            <dd className="font-medium text-sm">
              {params.distributionType
                ? distributionMap[params.distributionType] ?? params.distributionType
                : '알 수 없음'}
            </dd>
          </div>

          {/* 목표 수익률 표시 (있는 경우) */}
          {params.targetReturnRate && params.targetReturnRate > 0 && (
            <div className="flex justify-between items-center py-1 px-2 bg-green-500/10 rounded-md">
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-green-500" />
                목표 수익률
              </dt>
              <dd className="font-semibold text-green-500">{params.targetReturnRate}%</dd>
            </div>
          )}
        </>
      );
    }
    return null;
  };

  // 현재 포지션 정보 렌더링
  const renderPositionInfo = (): JSX.Element | null => {
    if (performance.avgCost === null || performance.qty === null || performance.qty === 0) {
      return null;
    }

    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">현재 포지션</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-muted/50 rounded-md px-2 py-1.5">
            <p className="text-xs text-muted-foreground">평균 단가</p>
            <p className="font-semibold">{formatPrice(performance.avgCost, strategy.market)}</p>
          </div>
          <div className="bg-muted/50 rounded-md px-2 py-1.5">
            <p className="text-xs text-muted-foreground">보유 수량</p>
            <p className="font-semibold">{performance.qty}주</p>
          </div>
        </div>
      </div>
    );
  };

  // 실행 상태 렌더링
  const renderExecutionStatus = (): JSX.Element | null => {
    if (!lastExecuted) return null;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 text-xs ${lastExecuted.isRecent ? 'text-green-500' : 'text-muted-foreground'}`}>
              {lastExecuted.isRecent ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              <span>{lastExecuted.text}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>마지막 실행: {new Date(strategy.lastExecutedAt!).toLocaleString('ko-KR')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const cardContent = (
    <Card
      className={`transition-all border-border/60 ${
        variant === 'compact'
          ? 'hover:shadow-md hover:border-primary/50 cursor-pointer'
          : 'shadow-sm'
      } ${strategy.status === 'ACTIVE' ? 'border-l-2 border-l-green-500' : ''}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base truncate">{typeMap[strategy.type] || strategy.type}</CardTitle>
            </div>

            {/* 종목 정보 - 종목명 포함 */}
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-foreground">{strategy.symbol}</span>
                {symbolName && (
                  <span className="text-xs text-muted-foreground">({symbolName})</span>
                )}
              </div>
              <span className="text-muted-foreground">·</span>
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {marketMap[strategy.market]}
              </Badge>
            </div>

            {/* 실행 상태 */}
            {strategy.status === 'ACTIVE' && (
              <div className="mt-2">
                {renderExecutionStatus()}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {showActions && (
              <Switch
                checked={isActive}
                onCheckedChange={handleStatusToggle}
                aria-label="Toggle strategy status"
              />
            )}
            <Badge
              variant={strategy.status ? (statusConfig[strategy.status]?.variant || 'outline') : 'outline'}
              className={`shrink-0 ${strategy.status ? statusConfig[strategy.status]?.className : ''}`}
            >
              {strategy.status ? (statusConfig[strategy.status]?.label || strategy.status) : '알 수 없음'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <dl className="space-y-2 text-sm">{renderDetails()}</dl>

        {/* 현재 포지션 정보 */}
        {variant === 'default' && renderPositionInfo()}

        {/* 액션 버튼 */}
        {showActions && (
          <div className="flex justify-between items-center gap-2 mt-4 pt-4 border-t">
            {/* 즉시 실행 버튼 */}
            {strategy.status === 'ACTIVE' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExecuteNow}
                      disabled={isExecuting}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <Play className="h-3.5 w-3.5 mr-1" />
                      {isExecuting ? '실행 중...' : '즉시 실행'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>다음 크론잡을 기다리지 않고 즉시 실행</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {strategy.status !== 'ACTIVE' && <div />}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={editUrl}>
                  <Edit className="h-3 w-3 mr-1" />
                  수정
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                      이 작업은 되돌릴 수 없습니다. &apos;{strategy.symbol}&apos; {typeMap[strategy.type] || strategy.type} 전략이
                      영구적으로 삭제됩니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (variant === 'compact') {
    return <Link href={editUrl}>{cardContent}</Link>;
  }

  return cardContent;
}
