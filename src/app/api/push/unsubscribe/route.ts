import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { api } from '@/lib/api';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function POST(_req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return api.error('Unauthorized', 401);
    }

    const userId = session.user.id;

    await db.update(users)
      .set({ pushSubscription: null })
      .where(eq(users.id, userId));

    return api.success({ message: 'Successfully unsubscribed.' });
  } catch (error) {
    console.error('POST /api/push/unsubscribe error:', error);
    return api.error('Internal Server Error', 500);
  }
}
