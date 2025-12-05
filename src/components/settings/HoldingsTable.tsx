'use client';

import { KISHolding } from '@/lib/kis/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface HoldingsTableProps {
  holdings: KISHolding[];
  market: 'US' | 'KR';
}

export function HoldingsTable({ holdings, market }: HoldingsTableProps) {
  const currencySymbol = market === 'US' ? '$' : '₩';
  const locale = market === 'US' ? 'en-US' : 'ko-KR';

  const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return `${currencySymbol}0`;
    if (market === 'US') {
      return `${currencySymbol}${value.toFixed(2)}`;
    }
    return `${currencySymbol}${value.toLocaleString(locale)}`;
  };

  if (holdings.length === 0) {
    return (
      <p className="text-muted-foreground py-4">
        보유 중인 {market === 'US' ? '미국' : '한국'} 종목이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>종목</TableHead>
            <TableHead className="text-right">보유수량</TableHead>
            <TableHead className="text-right">평균단가</TableHead>
            <TableHead className="text-right">현재가</TableHead>
            <TableHead className="text-right">평가금액</TableHead>
            <TableHead className="text-right">수익률</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((holding) => (
            <TableRow key={holding.symbol}>
              <TableCell>
                <div className="font-semibold">{holding.symbol}</div>
                {holding.name && (
                  <div className="text-sm text-muted-foreground">{holding.name}</div>
                )}
              </TableCell>
              <TableCell className="text-right">
                {holding.quantity?.toLocaleString() || '0'}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(holding.averagePrice)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(holding.currentPrice)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(holding.valuationPrice)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-semibold',
                  (holding.profitRate ?? 0) >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {(holding.profitRate ?? 0) >= 0 ? '+' : ''}
                {holding.profitRate?.toFixed(2) || '0.00'}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
