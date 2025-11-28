'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types/order';

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const statusConfig: Record<OrderStatus, {
  label: string;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
  icon: React.ReactNode;
}> = {
  SUBMITTED: {
    label: '대기',
    variant: 'default',
    icon: <Clock className="h-3 w-3" />,
  },
  PARTIALLY_FILLED: {
    label: '부분체결',
    variant: 'outline',
    icon: <Loader2 className="h-3 w-3" />,
  },
  FILLED: {
    label: '체결',
    variant: 'outline',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  CANCELLED: {
    label: '취소',
    variant: 'secondary',
    icon: <XCircle className="h-3 w-3" />,
  },
  FAILED: {
    label: '실패',
    variant: 'destructive',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant}
      className={cn('flex items-center gap-1 w-fit', className)}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}
