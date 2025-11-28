'use client';

import { cn } from '@/lib/utils';

export type BalanceStatVariant = 'default' | 'primary' | 'success' | 'warning' | 'destructive';

interface BalanceStatCardProps {
  label: string;
  value: string;
  subValue?: string;
  variant?: BalanceStatVariant;
  className?: string;
}

const variantStyles: Record<BalanceStatVariant, {
  bg: string;
  value: string;
  subValue: string;
}> = {
  default: {
    bg: 'bg-muted/50',
    value: 'text-foreground',
    subValue: 'text-muted-foreground',
  },
  primary: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    value: 'text-blue-600 dark:text-blue-400',
    subValue: 'text-blue-600/70 dark:text-blue-400/70',
  },
  success: {
    bg: 'bg-green-500/10 dark:bg-green-500/20',
    value: 'text-green-600 dark:text-green-400',
    subValue: 'text-green-600/70 dark:text-green-400/70',
  },
  warning: {
    bg: 'bg-orange-500/10 dark:bg-orange-500/20',
    value: 'text-orange-600 dark:text-orange-400',
    subValue: 'text-orange-600/70 dark:text-orange-400/70',
  },
  destructive: {
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    value: 'text-red-600 dark:text-red-400',
    subValue: 'text-red-600/70 dark:text-red-400/70',
  },
};

export function BalanceStatCard({
  label,
  value,
  subValue,
  variant = 'default',
  className,
}: BalanceStatCardProps) {
  const styles = variantStyles[variant];

  return (
    <div className={cn('p-4 rounded-lg', styles.bg, className)}>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-2xl font-bold', styles.value)}>{value}</p>
      {subValue && (
        <p className={cn('text-sm', styles.subValue)}>{subValue}</p>
      )}
    </div>
  );
}
