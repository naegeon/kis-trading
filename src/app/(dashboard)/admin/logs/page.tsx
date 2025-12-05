'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { ContentCard } from '@/components/layout/ContentCard';
import { Label } from '@/components/ui/label';

type EventType = 'ORDER_SUBMITTED' | 'ORDER_FAILED' | 'ORDER_FILLED' | 'ORDER_CANCELLED' | 'STRATEGY_STARTED' | 'STRATEGY_ENDED' | 'SYSTEM' | null;

interface ExecutionLog {
  id: string;
  logLevel: 'ERROR' | 'WARN' | 'INFO';
  eventType: EventType;
  message: string;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  strategyId: string | null;
  createdAt: string;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
      });

      if (selectedLevel !== 'all') {
        params.append('level', selectedLevel);
      }

      if (selectedEventType !== 'all') {
        params.append('eventType', selectedEventType);
      }

      const response = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();
      if (data.success) {
        setLogs(data.data.logs);
        setTotalPages(data.data.pagination.totalPages);
      } else {
        throw new Error(data.error || 'Failed to fetch logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, selectedLevel, selectedEventType]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getLogLevelIcon = (level: string): JSX.Element => {
    switch (level) {
      case 'ERROR':
        return <AlertCircle className="h-4 w-4" />;
      case 'WARN':
        return <AlertTriangle className="h-4 w-4" />;
      case 'INFO':
        return <Info className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getLogLevelBadgeVariant = (
    level: string
  ): 'destructive' | 'default' | 'secondary' => {
    switch (level) {
      case 'ERROR':
        return 'destructive';
      case 'WARN':
        return 'default';
      case 'INFO':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="실행 로그"
        description="시스템 에러 및 경고 로그를 확인합니다."
        breadcrumbs={[
          { label: '홈', href: '/' },
          { label: '설정', href: '/settings' },
          { label: '실행 로그' },
        ]}
        actions={
          <Button onClick={fetchLogs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
        }
      />

      <ContentCard>
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Label>로그 레벨:</Label>
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="ERROR">ERROR</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
                <SelectItem value="INFO">INFO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label>이벤트:</Label>
            <Select value={selectedEventType} onValueChange={setSelectedEventType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="ORDER_SUBMITTED">주문 제출</SelectItem>
                <SelectItem value="ORDER_FAILED">주문 실패</SelectItem>
                <SelectItem value="ORDER_FILLED">주문 체결</SelectItem>
                <SelectItem value="ORDER_CANCELLED">주문 취소</SelectItem>
                <SelectItem value="STRATEGY_STARTED">전략 시작</SelectItem>
                <SelectItem value="STRATEGY_ENDED">전략 종료</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md mb-4">
            <p className="text-sm">오류: {error}</p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">로그를 불러오는 중...</p>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">시간</TableHead>
                    <TableHead className="w-24">레벨</TableHead>
                    <TableHead className="w-28">이벤트</TableHead>
                    <TableHead>메시지</TableHead>
                    <TableHead className="w-32">사용자 ID</TableHead>
                    <TableHead className="w-32">전략 ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-12 text-muted-foreground"
                      >
                        로그가 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {new Date(log.createdAt).toLocaleString('ko-KR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getLogLevelBadgeVariant(log.logLevel)}
                            className="flex items-center gap-1 w-fit"
                          >
                            {getLogLevelIcon(log.logLevel)}
                            {log.logLevel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.eventType ? (
                            <Badge
                              variant={log.eventType === 'ORDER_SUBMITTED' ? 'default' : log.eventType === 'ORDER_FAILED' ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              {log.eventType === 'ORDER_SUBMITTED' && '주문제출'}
                              {log.eventType === 'ORDER_FAILED' && '주문실패'}
                              {log.eventType === 'ORDER_FILLED' && '체결'}
                              {log.eventType === 'ORDER_CANCELLED' && '취소'}
                              {log.eventType === 'STRATEGY_STARTED' && '전략시작'}
                              {log.eventType === 'STRATEGY_ENDED' && '전략종료'}
                              {log.eventType === 'SYSTEM' && '시스템'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="truncate" title={log.message}>
                            {log.message}
                          </div>
                          {log.metadata && (
                            <details className="text-xs text-muted-foreground mt-1">
                              <summary className="cursor-pointer">
                                메타데이터
                              </summary>
                              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </details>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {log.userId ? log.userId.slice(0, 8) + '...' : '-'}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {log.strategyId
                            ? log.strategyId.slice(0, 8) + '...'
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  페이지 {currentPage} / {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    다음
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </ContentCard>
    </PageContainer>
  );
}
