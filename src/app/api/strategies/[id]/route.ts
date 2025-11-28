
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { strategies, strategyStatusEnum, credentials } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { api } from '@/lib/api';
import { z } from 'zod';
import { looLocStrategySchema } from '@/lib/validations/strategy';
import { NextResponse } from 'next/server';
import { LooLocStrategyParams } from '@/types/strategy';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { executeStrategyImmediately } from '@/lib/strategies/executor';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const strategyId = params.id;

  try {
    const [strategy] = await db
      .select()
      .from(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)));

    if (!strategy) {
      return api.error('Strategy not found or you do not have permission', 404);
    }

    return api.success(strategy);
  } catch (error) {
    console.error('Error fetching strategy:', error);
    return api.error('Failed to fetch strategy', 500);
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const strategyId = params.id;

  try {
    const json = await request.json();
    const body = looLocStrategySchema.parse(json);

    // Verify the strategy exists and belongs to the user
    const [existingStrategy] = await db
      .select()
      .from(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)));

    if (!existingStrategy) {
      return api.error('Strategy not found or you do not have permission', 404);
    }

    // Update strategy with server-managed fields (보존해야 할 필드들)
    const existingParams = existingStrategy.parameters as LooLocStrategyParams;
    const parameters = {
      ...body,
      // 서버에서 관리하는 필드들 보존
      isFirstExecution: existingParams?.isFirstExecution ?? true,
      currentAvgCost: existingParams?.currentAvgCost ?? 0,
      currentQty: existingParams?.currentQty ?? 0,
      // 거래소 코드 보존 (기존 값 유지 또는 기본값 NASD)
      exchangeCode: existingParams?.exchangeCode || 'NASD',
    };

    const [updatedStrategy] = await db
      .update(strategies)
      .set({
        symbol: body.symbol,
        parameters,
        startDate: body.startDate,
        endDate: body.endDate,
        updatedAt: new Date(),
      })
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)))
      .returning();

    // LOO/LOC 전략 수정 후 즉시 실행 (ACTIVE 상태인 경우에만)
    let executionResult = null;
    if (updatedStrategy.status === 'ACTIVE' && updatedStrategy.type === 'LOO_LOC') {
      const userCredentials = await db.query.credentials.findFirst({
        where: eq(credentials.userId, session.user.id),
      });

      if (userCredentials) {
        const decryptedCreds = getDecryptedCredentials(userCredentials);
        const kisClient = new KISClient({
          appkey: decryptedCreds.appKey,
          appsecret: decryptedCreds.appSecret,
          isMock: decryptedCreds.isMock,
          accountNumber: decryptedCreds.accountNumber,
          credentialsId: decryptedCreds.credentialsId,
        });

        executionResult = await executeStrategyImmediately(updatedStrategy, kisClient);
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedStrategy,
      ...(executionResult && { execution: executionResult }),
    }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors }, { status: 400 });
    }
    console.error('Error updating strategy:', error);
    return api.error('Failed to update strategy', 500);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const strategyId = params.id;
  const { status } = await request.json();

  if (!status || !strategyStatusEnum.enumValues.includes(status)) {
    return api.error('Invalid status provided', 400);
  }

  try {
    const [updatedStrategy] = await db
      .update(strategies)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)))
      .returning();

    if (!updatedStrategy) {
      return api.error('Strategy not found or you do not have permission', 404);
    }

    // 전략 상태를 ACTIVE로 변경 시 즉시 실행
    if (status === 'ACTIVE') {
      const userCredentials = await db.query.credentials.findFirst({
        where: eq(credentials.userId, session.user.id),
      });

      if (userCredentials) {
        const decryptedCreds = getDecryptedCredentials(userCredentials);
        const kisClient = new KISClient({
          appkey: decryptedCreds.appKey,
          appsecret: decryptedCreds.appSecret,
          isMock: decryptedCreds.isMock,
          accountNumber: decryptedCreds.accountNumber,
          credentialsId: decryptedCreds.credentialsId,
        });

        const executionResult = await executeStrategyImmediately(updatedStrategy, kisClient);

        return NextResponse.json({
          success: true,
          data: updatedStrategy,
          execution: executionResult,
        }, { status: 200 });
      }
    }

    return api.success(updatedStrategy);
  } catch (error) {
    console.error('Error updating strategy:', error);
    return api.error('Failed to update strategy', 500);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const strategyId = params.id;

  try {
    const [deletedStrategy] = await db
      .delete(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)))
      .returning();

    if (!deletedStrategy) {
      return api.error('Strategy not found or you do not have permission', 404);
    }

    return api.success({ message: 'Strategy deleted successfully' });
  } catch (error) {
    console.error('Error deleting strategy:', error);
    return api.error('Failed to delete strategy', 500);
  }
}
