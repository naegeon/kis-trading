'use client';

import { cn } from '@/lib/utils';

interface SymbolDisplayProps {
  symbol: string;
  name?: string | null;
  className?: string;
}

export function SymbolDisplay({ symbol, name, className }: SymbolDisplayProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="font-medium">{symbol}</span>
      {name && (
        <span className="text-xs text-muted-foreground truncate max-w-[150px]">
          {name}
        </span>
      )}
    </div>
  );
}
