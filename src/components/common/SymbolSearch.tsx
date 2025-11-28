'use client';

import { Input } from '@/components/ui/input';

interface SymbolSearchProps {
  value: string;
  onValueChange: (symbol: string) => void;
  market?: 'US' | 'KR';
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 종목 검색 컴포넌트 (수동 입력 모드)
 *
 * 참고: stockSymbols 테이블에 데이터가 있으면 자동완성 기능을 추가할 수 있습니다.
 * 현재는 DB에 종목 데이터가 없어서 수동 입력 모드로 구현했습니다.
 */
export function SymbolSearch({
  value,
  onValueChange,
  market,
  placeholder,
  disabled = false,
}: SymbolSearchProps) {
  const defaultPlaceholder = market === 'KR'
    ? '예: 005930, 035720'
    : '예: AAPL, TSLA, SOXL';

  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onValueChange(e.target.value.toUpperCase())}
      placeholder={placeholder || defaultPlaceholder}
      disabled={disabled}
      className="uppercase"
    />
  );
}
