
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { strategies, strategyStatusEnum, credentials, orders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { api } from '@/lib/api';
import { z } from 'zod';
import { looLocStrategySchema } from '@/lib/validations/strategy';
import { NextResponse } from 'next/server';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import { executeStrategyImmediately } from '@/lib/strategies/executor';
import { isLooLocParams, isValidExchangeCode } from '@/lib/utils/type-guards';

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

    // Update strategy with server-managed fields
    // [DEPRECATED] isFirstExecution, currentAvgCost, currentQty - KIS API 보유 조회로 대체
    // 타입 가드로 기존 파라미터 검증
    const existingParams = isLooLocParams(existingStrategy.parameters)
      ? existingStrategy.parameters
      : null;
    const rawExchangeCode = existingParams?.exchangeCode;
    const parameters = {
      ...body,
      // 거래소 코드 보존 (기존 값 유지 또는 기본값 NASD)
      exchangeCode: isValidExchangeCode(rawExchangeCode) ? rawExchangeCode : 'NASD',
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
    // 먼저 기존 전략 조회 (미체결 주문 취소용)
    const [existingStrategy] = await db
      .select()
      .from(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)));

    if (!existingStrategy) {
      return api.error('Strategy not found or you do not have permission', 404);
    }

    const [updatedStrategy] = await db
      .update(strategies)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)))
      .returning();

    // 사용자 API 자격증명 조회
    const userCredentials = await db.query.credentials.findFirst({
      where: eq(credentials.userId, session.user.id),
    });

    // 전략 비활성화 시 (INACTIVE 또는 ENDED) 미체결 주문 취소
    if ((status === 'INACTIVE' || status === 'ENDED') && userCredentials) {
      const decryptedCreds = getDecryptedCredentials(userCredentials);
      const kisClient = new KISClient({
        appkey: decryptedCreds.appKey,
        appsecret: decryptedCreds.appSecret,
        isMock: decryptedCreds.isMock,
        accountNumber: decryptedCreds.accountNumber,
        credentialsId: decryptedCreds.credentialsId,
      });

      // DB에서 미체결 주문 조회
      const pendingOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.strategyId, strategyId),
          eq(orders.status, 'SUBMITTED')
        ),
      });

      // KIS API로 미체결 주문 취소
      // 타입 가드로 파라미터 검증
      const looLocParams = isLooLocParams(existingStrategy.parameters)
        ? existingStrategy.parameters
        : null;
      const cancelExchangeCode = isValidExchangeCode(looLocParams?.exchangeCode)
        ? looLocParams.exchangeCode
        : 'NASD';
      for (const order of pendingOrders) {
        if (!order.kisOrderId) continue;

        try {
          await kisClient.cancelOrder({
            kisOrderId: order.kisOrderId,
            symbol: existingStrategy.symbol,
            quantity: order.quantity,
            market: existingStrategy.market,
            exchangeCode: cancelExchangeCode,
          });

          // DB 상태 업데이트
          await db.update(orders)
            .set({ status: 'CANCELLED' })
            .where(eq(orders.id, order.id));
        } catch (cancelError) {
          console.error(`Failed to cancel order ${order.kisOrderId}:`, cancelError);
        }
      }

      return NextResponse.json({
        success: true,
        data: updatedStrategy,
        cancelledOrders: pendingOrders.length,
      }, { status: 200 });
    }

    // 전략 상태를 ACTIVE로 변경 시 즉시 실행
    if (status === 'ACTIVE' && userCredentials) {
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
    // 1. 전략 조회 (삭제 전에 정보 필요)
    const [strategy] = await db
      .select()
      .from(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)));

    if (!strategy) {
      return api.error('Strategy not found or you do not have permission', 404);
    }

    // 2. 사용자 API 자격증명 조회
    const userCredentials = await db.query.credentials.findFirst({
      where: eq(credentials.userId, session.user.id),
    });

    // 3. 미체결 주문 취소 (KIS API)
    if (userCredentials) {
      const decryptedCreds = getDecryptedCredentials(userCredentials);
      const kisClient = new KISClient({
        appkey: decryptedCreds.appKey,
        appsecret: decryptedCreds.appSecret,
        isMock: decryptedCreds.isMock,
        accountNumber: decryptedCreds.accountNumber,
        credentialsId: decryptedCreds.credentialsId,
      });

      // DB에서 미체결 주문 조회
      const pendingOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.strategyId, strategyId),
          eq(orders.status, 'SUBMITTED')
        ),
      });

      // KIS API로 미체결 주문 취소
      // 타입 가드로 파라미터 검증
      const looLocParamsForDelete = isLooLocParams(strategy.parameters)
        ? strategy.parameters
        : null;
      const deleteExchangeCode = isValidExchangeCode(looLocParamsForDelete?.exchangeCode)
        ? looLocParamsForDelete.exchangeCode
        : 'NASD';
      for (const order of pendingOrders) {
        if (!order.kisOrderId) continue;

        try {
          await kisClient.cancelOrder({
            kisOrderId: order.kisOrderId,
            symbol: strategy.symbol,
            quantity: order.quantity,
            market: strategy.market,
            exchangeCode: deleteExchangeCode,
          });

          // DB 상태 업데이트
          await db.update(orders)
            .set({ status: 'CANCELLED' })
            .where(eq(orders.id, order.id));
        } catch (cancelError) {
          console.error(`Failed to cancel order ${order.kisOrderId}:`, cancelError);
          // 취소 실패해도 전략 삭제는 계속 진행
        }
      }
    }

    // 4. 전략 삭제
    await db
      .delete(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.userId, session.user.id)));

    return api.success({ message: 'Strategy deleted successfully' });
  } catch (error) {
    console.error('Error deleting strategy:', error);
    return api.error('Failed to delete strategy', 500);
  }
}
