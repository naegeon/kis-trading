
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { api } from '@/lib/api';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const { id: orderId } = params;

  try {
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.userId, session.user.id)),
    });

    if (!order) {
      return api.error('Order not found', 404);
    }

    return api.success(order);
  } catch (error) {
    console.error(`Error fetching order ${orderId}:`, error);
    return api.error('Failed to fetch order', 500);
  }
}
