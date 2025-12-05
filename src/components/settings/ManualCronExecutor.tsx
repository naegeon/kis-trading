'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { PlayCircle, RefreshCw, Clock, CheckCircle, XCircle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CronJob {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  icon: typeof PlayCircle;
}

const cronJobs: CronJob[] = [
  {
    id: 'execute-strategies',
    name: '전략 실행',
    description: '활성화된 모든 전략을 실행하고 주문을 제출합니다 (원래 일정: 매일 오후 9시)',
    endpoint: '/api/cron/execute-strategies',
    icon: PlayCircle,
  },
  {
    id: 'sync-order-status',
    name: '주문 상태 동기화',
    description: 'KIS API에서 주문 상태를 조회하여 DB를 업데이트합니다 (원래 일정: 매일 오전 6시 30분)',
    endpoint: '/api/cron/sync-order-status',
    icon: RefreshCw,
  },
  {
    id: 'collect-metrics',
    name: '성과 지표 수집',
    description: '일일 성과 지표를 계산하고 저장합니다 (원래 일정: 매일 오전 7시)',
    endpoint: '/api/cron/collect-metrics',
    icon: Clock,
  },
];

export function ManualCronExecutor() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const isAdmin = !adminEmail || session?.user?.email === adminEmail;
  const isDevelopment = process.env.NODE_ENV === 'development';

  const executeCron = async (job: CronJob): Promise<void> => {
    setLoading((prev) => ({ ...prev, [job.id]: true }));
    setResults((prev) => {
      const newResults = { ...prev };
      delete newResults[job.id];
      return newResults;
    });

    try {
      const response = await fetch(job.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok) {
        setResults((prev) => ({
          ...prev,
          [job.id]: {
            success: true,
            message: data.message || '크론잡이 성공적으로 실행되었습니다.',
          },
        }));
      } else {
        setResults((prev) => ({
          ...prev,
          [job.id]: {
            success: false,
            message: data.error || data.message || '크론잡 실행에 실패했습니다.',
          },
        }));
      }
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [job.id]: {
          success: false,
          message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [job.id]: false }));
    }
  };

  if (!isAdmin && !isDevelopment) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>관리자만 이 기능을 사용할 수 있습니다.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 mb-4">
        <h3 className="text-lg font-semibold">크론잡 수동 실행 (개발용)</h3>
        <p className="text-sm text-muted-foreground">
          로컬 개발 환경에서 스케줄된 작업을 수동으로 실행할 수 있습니다.
          실제 운영 환경에서는 Vercel Cron이 자동으로 실행합니다.
        </p>
      </div>

      {cronJobs.map((job) => {
        const Icon = job.icon;
        const isLoading = loading[job.id];
        const result = results[job.id];

        return (
          <div key={job.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{job.name}</span>
                </div>
                <p className="text-sm text-muted-foreground">{job.description}</p>
              </div>
              <Button onClick={() => executeCron(job)} disabled={isLoading} size="sm">
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    실행 중...
                  </>
                ) : (
                  <>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    실행
                  </>
                )}
              </Button>
            </div>

            {result && (
              <Alert variant={result.success ? 'default' : 'destructive'}>
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{result.message}</AlertDescription>
                </div>
              </Alert>
            )}
          </div>
        );
      })}

      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>참고:</strong> 이 기능은 개발 및 테스트 목적으로만 사용하세요.
          프로덕션 환경에서는 설정된 스케줄에 따라 자동으로 실행됩니다.
        </p>
      </div>
    </div>
  );
}
