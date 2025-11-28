import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { pushSubscriptionSchema } from '@/lib/validations/push';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await req.json();
    const parsedSubscription = pushSubscriptionSchema.safeParse(body);

    if (!parsedSubscription.success) {
      return NextResponse.json({ error: 'Invalid subscription data', details: parsedSubscription.error.flatten() }, { status: 400 });
    }

    await db.update(users)
      .set({ pushSubscription: parsedSubscription.data })
      .where(eq(users.id, userId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('POST /api/push/subscribe error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
