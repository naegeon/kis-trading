import { NextResponse } from 'next/server';
import { auth } from '@/auth';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

/**
 * Manual execution endpoint for testing (development only)
 * GET /api/manual/execute-strategies
 */
export async function GET(request: Request) {
  // Only allow in development or for authenticated users
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Call the cron endpoint internally
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const response = await fetch(`${baseUrl}/api/cron/execute-strategies?batch=0&batchSize=5`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Manual execution completed',
      cronResponse: data,
    });
  } catch (error) {
    console.error('Manual execution error:', error);
    return NextResponse.json(
      { error: 'Failed to execute strategies', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
