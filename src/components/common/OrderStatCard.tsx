'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export type OrderStatCardVariant = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

interface OrderStatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  variant?: OrderStatCardVariant;
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
}

const variantStyles: Record<OrderStatCardVariant, {
  icon: string;
  value: string;
  bg: string;
  activeBg: string;
}> = {
  default: {
    icon: 'text-muted-foreground',
    value: '',
    bg: '',
    activeBg: 'bg-muted',
  },
  primary: {
    icon: 'text-blue-500',
    value: 'text-blue-500',
    bg: '',
    activeBg: 'bg-blue-500/10',
  },
  success: {
    icon: 'text-green-500',
    value: 'text-green-500',
    bg: '',
    activeBg: 'bg-green-500/10',
  },
  warning: {
    icon: 'text-yellow-500',
    value: 'text-yellow-500',
    bg: 'bg-yellow-500/5',
    activeBg: 'bg-yellow-500/15',
  },
  destructive: {
    icon: 'text-destructive',
    value: 'text-destructive',
    bg: '',
    activeBg: 'bg-destructive/10',
  },
  muted: {
    icon: 'text-muted-foreground',
    value: '',
    bg: '',
    activeBg: 'bg-muted',
  },
};

export function OrderStatCard({
  icon: Icon,
  label,
  value,
  variant = 'default',
  onClick,
  isActive,
  className,
}: OrderStatCardProps) {
  const styles = variantStyles[variant];

  return (
    <Card
      className={cn(
        'transition-all',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary/50',
        isActive && styles.activeBg,
        isActive && 'ring-2 ring-primary/30',
        styles.bg,
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className={cn('flex items-center gap-2 mb-1', styles.icon)}>
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className={cn('text-2xl font-bold', styles.value)}>{value}</p>
      </CardContent>
    </Card>
  );
}
