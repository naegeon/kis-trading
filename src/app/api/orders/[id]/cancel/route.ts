
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { orders, credentials } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { api } from '@/lib/api';
import { KISClient } from '@/lib/kis/client';
import { decrypt } from '@/lib/crypto/encryption';
import { KISAPIError } from '@/lib/errors';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const { id: orderId } = params;

  try {
    // 1. Find the order and verify ownership (with strategy for market field)
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.userId, session.user.id)),
      with: {
        strategy: true, // strategy를 조인하여 market 필드 가져오기
      },
    });

    if (!order) {
      return api.error('Order not found', 404);
    }

    // 2. Check if the order is in a cancelable state
    if (order.status !== 'SUBMITTED' && order.status !== 'PARTIALLY_FILLED') {
      return api.error(`Order in status ${order.status} cannot be cancelled.`, 400);
    }

    if (!order.kisOrderId) {
      return api.error('Cannot cancel an order that was not submitted to KIS.', 400);
    }

    // 3. Get and decrypt user credentials
    const userCredentials = await db.query.credentials.findFirst({
      where: eq(credentials.userId, session.user.id),
    });

    if (!userCredentials) {
      return api.error('KIS credentials not found.', 400);
    }

    if (!userCredentials.appKeyEncrypted || !userCredentials.appSecretEncrypted || !userCredentials.accountNumberEncrypted) {
      return api.error('KIS credentials are incomplete.', 400);
    }

    const appkey = decrypt(userCredentials.appKeyEncrypted);
    const appsecret = decrypt(userCredentials.appSecretEncrypted);
    const accountNumber = decrypt(userCredentials.accountNumberEncrypted);

    // 4. Initialize KISClient and call cancelOrder
    const kisClient = new KISClient({
      appkey,
      appsecret,
      accountNumber,
      isMock: userCredentials.isMock ?? true,
    });

    await kisClient.cancelOrder({
      kisOrderId: order.kisOrderId,
      symbol: order.symbol,
      quantity: order.quantity,
      market: order.strategy?.market ?? 'US', // 전략의 시장 정보 전달 (기본값: US)
    });

    // 5. Update order status in DB
    await db
      .update(orders)
      .set({ status: 'CANCELLED' })
      .where(eq(orders.id, orderId));

    return api.success({ message: 'Order cancelled successfully' });

  } catch (error) {
    console.error(`Error cancelling order ${orderId}:`, error);
    if (error instanceof KISAPIError) {
      return api.error(`KIS API Error: ${error.message}`, error.statusCode);
    }
    return api.error('Failed to cancel order', 500);
  }
}
