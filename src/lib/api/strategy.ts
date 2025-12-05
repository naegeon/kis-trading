import { Strategy, StrategyStatus } from "@/types/strategy";

export async function getStrategies(): Promise<Strategy[]> {
  const res = await fetch('/api/strategies', {
    cache: 'no-store', // Always fetch the latest data
  });

  if (!res.ok) {
    throw new Error('Failed to fetch strategies');
  }
  const data = await res.json();
  return data.data;
}

export async function updateStrategyStatus(id: string, status: StrategyStatus): Promise<Strategy> {
  const res = await fetch(`/api/strategies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to update strategy status');
  }
  const data = await res.json();
  return data.data;
}

export async function deleteStrategy(id: string): Promise<void> {
  const res = await fetch(`/api/strategies/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to delete strategy');
  }
}
