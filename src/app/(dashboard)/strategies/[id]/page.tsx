'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Strategy } from '@/types/strategy';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { STRATEGY_TYPE_LABELS } from '@/lib/constants/strategy';

type StrategyParamsProps = {
    params: Record<string, unknown>;
};

function StrategyParameters({ params }: StrategyParamsProps) {
    return (
        <div className="grid grid-cols-2 gap-4 text-sm">
            {Object.entries(params).map(([key, value]) => (
                <div key={key}>
                    <p className="font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-gray-700">{String(value)}</p>
                </div>
            ))}
        </div>
    );
}

export default function StrategyDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!id) return;

        async function fetchStrategy() {
            try {
                setLoading(true);
                const response = await fetch(`/api/strategies/${id}`);
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.message || '전략을 불러오는데 실패했습니다');
                }
                const data = await response.json();
                if (data.success) {
                    setStrategy(data.data);
                    // Redirect to edit page based on strategy type
                    const editUrl = data.data.type === 'LOO_LOC'
                        ? `/strategies/loo-loc?id=${id}`
                        : `/strategies/split-order?id=${id}`;
                    router.replace(editUrl);
                } else {
                    throw new Error(data.message || '전략을 불러오는데 실패했습니다');
                }
            } catch (err: unknown) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('알 수 없는 오류가 발생했습니다');
                }
            } finally {
                setLoading(false);
            }
        }

        fetchStrategy();
    }, [id, router]);

    const handleToggleStatus = async () => {
        if (!strategy) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const newStatus = strategy.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
            const response = await fetch(`/api/strategies/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || '상태 변경에 실패했습니다');
            }
            setStrategy(data.data);
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('알 수 없는 오류가 발생했습니다');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!strategy) return;
        if (!window.confirm('이 전략을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            const response = await fetch(`/api/strategies/${id}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || '전략 삭제에 실패했습니다');
            }
            router.push('/');
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('알 수 없는 오류가 발생했습니다');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const statusMap = {
        ACTIVE: '활성',
        INACTIVE: '비활성',
        ENDED: '종료',
    } as const;

    const typeMap = STRATEGY_TYPE_LABELS;

    return (
        <div className="container mx-auto p-4 md:p-8">
            <div className="mb-6">
                <Link href="/">
                    <Button variant="outline"> &larr; 대시보드로 돌아가기</Button>
                </Link>
            </div>

            {loading && <p>전략 정보를 불러오는 중...</p>}
            {error && <p className="text-red-500">오류: {error}</p>}

            {!loading && !error && strategy && (
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-2xl">{strategy.name}</CardTitle>
                                <p className="text-sm text-gray-500">{strategy.symbol}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${strategy.status === 'ACTIVE' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                                {strategy.status ? ((statusMap as Record<string, string>)[strategy.status] || strategy.status) : 'Unknown'}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold border-b pb-2 mb-4">상세 정보</h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="font-semibold">전략 유형</p>
                                    <p className="text-gray-700">{strategy.type ? ((typeMap as Record<string, string>)[strategy.type] || strategy.type) : 'Unknown'}</p>
                                </div>
                                <div>
                                    <p className="font-semibold">생성일</p>
                                    <p className="text-gray-700">{new Date(strategy.createdAt!).toLocaleString('ko-KR')}</p>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold border-b pb-2 mb-4">전략 파라미터</h3>
                            <StrategyParameters params={strategy.parameters as Record<string, unknown>} />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                        <Button
                            variant={strategy.status === 'ACTIVE' ? 'secondary' : 'default'}
                            onClick={handleToggleStatus}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? '처리 중...' : (strategy.status === 'ACTIVE' ? '비활성화' : '활성화')}
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                            {isSubmitting ? '삭제 중...' : '삭제'}
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}
