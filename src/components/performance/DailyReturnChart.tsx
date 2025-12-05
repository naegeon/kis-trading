'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface DailyReturnChartProps {
  data: { date: string; returnRate: number }[];
}

// 날짜 포맷팅 함수 (MM/DD 형식)
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

// Y축 도메인 계산 (동적 범위)
function calculateYDomain(data: { returnRate: number }[]): [number, number] {
  if (data.length === 0) return [-10, 10];

  const rates = data.map(d => Number(d.returnRate) || 0);
  const min = Math.min(...rates);
  const max = Math.max(...rates);

  // 여유 공간 추가 (범위의 10%)
  const padding = Math.max(Math.abs(max - min) * 0.1, 1);

  // 0을 포함하도록 조정
  const yMin = Math.min(min - padding, 0);
  const yMax = Math.max(max + padding, 0);

  return [Math.floor(yMin), Math.ceil(yMax)];
}

export function DailyReturnChart({ data }: DailyReturnChartProps) {
  // Y축 도메인 계산 (memoized)
  const yDomain = useMemo(() => calculateYDomain(data), [data]);

  // 데이터가 없을 때
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>일일 수익률 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            표시할 데이터가 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>일일 수익률 추이</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                labelFormatter={(label) => {
                  const date = new Date(label);
                  return date.toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  });
                }}
                formatter={(value: number | string) => [`${Number(value).toFixed(2)}%`, '수익률']}
              />
              <Line
                type="monotone"
                dataKey="returnRate"
                stroke="#8884d8"
                activeDot={{ r: 8 }}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
