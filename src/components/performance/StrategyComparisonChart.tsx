'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ReferenceLine } from 'recharts';

interface StrategyComparisonChartProps {
  data: { strategyName: string; returnRate: number }[];
}

// Y축 도메인 계산 (동적 범위)
function calculateYDomain(data: { returnRate: number }[]): [number, number] {
  if (data.length === 0) return [-10, 10];

  const rates = data.map(d => Number(d.returnRate) || 0);
  const min = Math.min(...rates);
  const max = Math.max(...rates);

  // 여유 공간 추가 (범위의 10%)
  const padding = Math.max(Math.abs(max - min) * 0.1, 2);

  // 0을 포함하도록 조정
  const yMin = Math.min(min - padding, 0);
  const yMax = Math.max(max + padding, 0);

  return [Math.floor(yMin), Math.ceil(yMax)];
}

export function StrategyComparisonChart({ data }: StrategyComparisonChartProps) {
  // Y축 도메인 계산 (memoized)
  const yDomain = useMemo(() => calculateYDomain(data), [data]);

  // 데이터가 없을 때
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>전략별 수익률 비교</CardTitle>
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
        <CardTitle>전략별 수익률 비교</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="strategyName"
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={80}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number | string) => [`${Number(value).toFixed(2)}%`, '수익률']}
              />
              <Legend />
              <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
              <Bar dataKey="returnRate" name="수익률">
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={Number(entry.returnRate) >= 0 ? '#22c55e' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
