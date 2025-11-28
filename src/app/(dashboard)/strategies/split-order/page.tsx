'use client';

import { SplitOrderForm } from "@/components/strategies/SplitOrderForm";
import { useSearchParams } from "next/navigation";

export default function SplitOrderPage() {
  const searchParams = useSearchParams();
  const strategyId = searchParams.get("id");
  const isEditMode = !!strategyId;

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">
        {isEditMode ? '분할매매 전략 수정' : '분할매매 전략 생성'}
      </h1>
      <SplitOrderForm />
    </div>
  );
}
