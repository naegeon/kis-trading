import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { StrategiesList } from '@/components/strategies/StrategiesList';
import { STRATEGY_TYPE_FULL_LABELS } from '@/lib/constants/strategy';

export default function StrategiesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="전략 관리"
        description="생성된 투자 전략을 확인하고 관리합니다. 토글을 통해 전략의 활성 상태를 변경할 수 있습니다."
        breadcrumbs={[
          { label: '홈', href: '/' },
          { label: '전략 관리' },
        ]}
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/strategies/split-order">
                <PlusCircle className="mr-2 h-4 w-4" />
                {STRATEGY_TYPE_FULL_LABELS.SPLIT_ORDER}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/strategies/loo-loc">
                <PlusCircle className="mr-2 h-4 w-4" />
                {STRATEGY_TYPE_FULL_LABELS.LOO_LOC}
              </Link>
            </Button>
          </div>
        }
      />

      <StrategiesList />
    </PageContainer>
  );
}
