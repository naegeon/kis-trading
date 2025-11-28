'use client';

import { LooLocForm } from '@/components/strategies/LooLocForm';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Strategy } from '@/types/strategy';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { STRATEGY_TYPE_FULL_LABELS } from '@/lib/constants/strategy';

interface UserCredentials {
  id: string;
  appKey: string;
  appSecret: string;
  accountNumber: string;
  isMock: boolean;
}

export default function LooLocStrategyPage() {
  const searchParams = useSearchParams();
  const strategyId = searchParams.get('id');
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);

  useEffect(() => {
    // Fetch user credentials to check if it's a mock account
    Promise.all([
      fetch('/api/credentials').then(res => res.json()),
      strategyId ? fetch(`/api/strategies/${strategyId}`).then(res => res.json()) : Promise.resolve(null),
    ])
      .then(([credentialsData, strategyData]) => {
        if (credentialsData.success && credentialsData.data) {
          setUserCredentials(credentialsData.data);
        }
        if (strategyData?.success) {
          setStrategy(strategyData.data);
        }
      })
      .catch(error => console.error('Failed to fetch data:', error))
      .finally(() => setLoading(false));
  }, [strategyId]);

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <p>로딩 중...</p>
      </div>
    );
  }

  // Phase 2 - Task 2.1.3: 모의투자 계좌인 경우 경고 표시
  if (userCredentials?.isMock) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-8">{STRATEGY_TYPE_FULL_LABELS.LOO_LOC} 생성</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{STRATEGY_TYPE_FULL_LABELS.LOO_LOC} 사용 불가</AlertTitle>
          <AlertDescription>
            <p className="mb-4">
              LOO/LOC 주문은 모의투자 API를 지원하지 않습니다.
              실거래 API 키를 등록해주세요.
            </p>
            <Button asChild variant="outline">
              <Link href="/settings">설정으로 이동</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!userCredentials) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-8">{STRATEGY_TYPE_FULL_LABELS.LOO_LOC} 생성</h1>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>API 인증 정보 없음</AlertTitle>
          <AlertDescription>
            <p className="mb-4">
              먼저 KIS API 인증 정보를 등록해주세요.
            </p>
            <Button asChild variant="outline">
              <Link href="/settings">설정으로 이동</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isEditMode = !!strategyId && !!strategy;

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">
        {isEditMode ? `${STRATEGY_TYPE_FULL_LABELS.LOO_LOC} 수정` : `${STRATEGY_TYPE_FULL_LABELS.LOO_LOC} 생성`}
      </h1>
      <LooLocForm strategyId={strategyId} initialData={strategy} />
    </div>
  );
}
