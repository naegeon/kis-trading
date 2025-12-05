'use client';

import { cn } from '@/lib/utils';

interface PriceDisplayProps {
  orderPrice: number | null;
  fillPrice: number | null;
  filledQty: number;
  currency?: string;
  className?: string;
}

export function PriceDisplay({
  orderPrice,
  fillPrice,
  filledQty,
  currency = '$',
  className,
}: PriceDisplayProps) {
  const formatPrice = (price: number | null) => {
    if (price === null) return '-';
    return `${currency}${price.toFixed(2)}`;
  };

  const showFillPrice = fillPrice && fillPrice > 0;
  const showOrderAsFill = !showFillPrice && filledQty > 0 && orderPrice;
  const hasFill = showFillPrice || showOrderAsFill;

  // 체결가가 있으면 "주문가 → 체결가" 형태로 간결하게 표시
  // 체결가가 없으면 주문가만 표시
  return (
    <div className={cn('text-right text-sm', className)}>
      {hasFill ? (
        <>
          <span className="text-muted-foreground">{formatPrice(orderPrice)}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="font-medium text-primary">
            {formatPrice(showFillPrice ? fillPrice : orderPrice)}
          </span>
        </>
      ) : (
        <span>{formatPrice(orderPrice)}</span>
      )}
    </div>
  );
}
