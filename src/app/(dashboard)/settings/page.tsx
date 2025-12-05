'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { FileText, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { ContentCard } from '@/components/layout/ContentCard';
import { CredentialsForm } from '@/components/settings/CredentialsForm';
import { PushNotificationToggle } from '@/components/settings/PushNotificationToggle';
import { ManualCronExecutor } from '@/components/settings/ManualCronExecutor';
import { AccountInfo } from '@/components/settings/AccountInfo';

export default function SettingsPage() {
  const { data: session } = useSession();

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const isAdmin = !adminEmail || session?.user?.email === adminEmail;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const showDevTools = isAdmin || isDevelopment;

  return (
    <PageContainer>
      <PageHeader
        title="설정"
        description="계정 및 시스템 설정을 관리합니다."
        breadcrumbs={[{ label: '홈', href: '/' }, { label: '설정' }]}
      />

      <div className="grid gap-6">
        <ContentCard
          title="KIS API 인증 정보"
          description="한국투자증권 API 연동을 위한 인증 정보를 설정합니다."
        >
          <CredentialsForm />
        </ContentCard>

        <ContentCard
          title="계좌 정보"
          description="연동된 계좌의 잔고 및 보유 종목을 확인합니다."
        >
          <AccountInfo />
        </ContentCard>

        <ContentCard
          title="푸시 알림"
          description="주문 체결, 전략 실행 등의 알림을 받습니다."
        >
          <PushNotificationToggle />
        </ContentCard>

        <ContentCard
          title="시스템 모니터링"
          description="시스템 상태 및 로그를 확인합니다."
        >
          <div className="flex items-start gap-4">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold mb-1">실행 로그</h3>
              <p className="text-sm text-muted-foreground mb-4">
                전략 실행 기록, 주문 제출 내역, 에러 로그를 확인할 수 있습니다.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/logs">
                  <FileText className="h-4 w-4 mr-2" />
                  로그 확인하기
                </Link>
              </Button>
            </div>
          </div>
        </ContentCard>

        {showDevTools && (
          <ContentCard
            title="개발 도구"
            description="수동 크론잡 실행 등 개발/테스트 도구입니다."
            headerAction={
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wrench className="h-4 w-4" />
                {isDevelopment ? '개발 환경' : '관리자'}
              </div>
            }
          >
            <ManualCronExecutor />
          </ContentCard>
        )}
      </div>
    </PageContainer>
  );
}
