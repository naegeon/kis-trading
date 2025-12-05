'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface QuantityProgressProps {
  filled: number;
  total: number;
  className?: string;
}

export function QuantityProgress({ filled, total, className }: QuantityProgressProps) {
  const progress = total > 0 ? (filled / total) * 100 : 0;
  const hasFilled = filled > 0;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="text-sm text-center font-medium">
        <span className={hasFilled ? 'text-primary' : ''}>{filled}</span>
        <span className="text-muted-foreground"> / {total}주</span>
      </div>
      {/* 체결된 수량이 있을 때만 프로그레스바 표시 */}
      {hasFilled && total > 0 && (
        <Progress value={progress} className="h-1.5" />
      )}
    </div>
  );
}
