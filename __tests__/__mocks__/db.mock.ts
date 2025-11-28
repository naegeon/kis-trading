/**
 * Database Mock
 * 실제 DB 연결 없이 테스트할 수 있도록 In-Memory DB 제공
 */

export interface MockUser {
  id: string;
  email: string;
  name: string;
}

export interface MockCredentials {
  id: string;
  userId: string;
  appKey: string;
  appSecret: string;
  accountNumber: string;
  isMock: boolean;
}

export interface MockStrategy {
  id: string;
  userId: string;
  name: string;
  type: 'SPLIT_ORDER' | 'LOO_LOC';
  status: 'ACTIVE' | 'INACTIVE' | 'ENDED';
  symbol: string;
  market: 'US' | 'KR';
  parameters: Record<string, unknown>;
  startDate: Date;
  endDate: Date;
  lastExecutedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockOrder {
  id: string;
  strategyId: string | null;
  userId: string;
  kisOrderId: string | null;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'LOO' | 'LOC';
  quantity: number;
  price: string | null;
  status: 'SUBMITTED' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'FAILED';
  filledQuantity: number | null;
  avgPrice: string | null;
  errorMessage: string | null;
  submittedAt: Date;
  filledAt: Date | null;
}

export interface MockExecutionLog {
  id: string;
  userId: string | null;
  strategyId: string | null;
  logLevel: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

class InMemoryDB {
  users: MockUser[] = [];
  credentials: MockCredentials[] = [];
  strategies: MockStrategy[] = [];
  orders: MockOrder[] = [];
  executionLogs: MockExecutionLog[] = [];

  private generateId(): string {
    return `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ========== Users ==========
  createUser(data: Omit<MockUser, 'id'>): MockUser {
    const user = { id: this.generateId(), ...data };
    this.users.push(user);
    return user;
  }

  findUserById(id: string): MockUser | undefined {
    return this.users.find(u => u.id === id);
  }

  // ========== Credentials ==========
  createCredentials(data: Omit<MockCredentials, 'id'>): MockCredentials {
    const cred = { id: this.generateId(), ...data };
    this.credentials.push(cred);
    return cred;
  }

  findCredentialsByUserId(userId: string): MockCredentials | undefined {
    return this.credentials.find(c => c.userId === userId);
  }

  // ========== Strategies ==========
  createStrategy(data: Omit<MockStrategy, 'id' | 'createdAt' | 'updatedAt'>): MockStrategy {
    const strategy: MockStrategy = {
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    this.strategies.push(strategy);
    return strategy;
  }

  findStrategyById(id: string): MockStrategy | undefined {
    return this.strategies.find(s => s.id === id);
  }

  findStrategiesByUserId(userId: string): MockStrategy[] {
    return this.strategies.filter(s => s.userId === userId);
  }

  findActiveStrategies(): MockStrategy[] {
    return this.strategies.filter(s => s.status === 'ACTIVE');
  }

  updateStrategy(id: string, data: Partial<MockStrategy>): MockStrategy | undefined {
    const idx = this.strategies.findIndex(s => s.id === id);
    if (idx === -1) return undefined;
    this.strategies[idx] = { ...this.strategies[idx], ...data, updatedAt: new Date() };
    return this.strategies[idx];
  }

  // ========== Orders ==========
  createOrder(data: Omit<MockOrder, 'id'>): MockOrder {
    const order: MockOrder = {
      id: this.generateId(),
      ...data,
    };
    this.orders.push(order);
    return order;
  }

  findOrderById(id: string): MockOrder | undefined {
    return this.orders.find(o => o.id === id);
  }

  findOrdersByStrategyId(strategyId: string): MockOrder[] {
    return this.orders.filter(o => o.strategyId === strategyId);
  }

  findOrdersByUserId(userId: string): MockOrder[] {
    return this.orders.filter(o => o.userId === userId);
  }

  findTodayOrdersByStrategyId(strategyId: string): MockOrder[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.orders.filter(o =>
      o.strategyId === strategyId &&
      o.submittedAt >= today
    );
  }

  findPendingOrders(): MockOrder[] {
    return this.orders.filter(o =>
      o.status === 'SUBMITTED' || o.status === 'PARTIALLY_FILLED'
    );
  }

  updateOrder(id: string, data: Partial<MockOrder>): MockOrder | undefined {
    const idx = this.orders.findIndex(o => o.id === id);
    if (idx === -1) return undefined;
    this.orders[idx] = { ...this.orders[idx], ...data };
    return this.orders[idx];
  }

  // ========== Execution Logs ==========
  createLog(data: Omit<MockExecutionLog, 'id' | 'createdAt'>): MockExecutionLog {
    const log: MockExecutionLog = {
      id: this.generateId(),
      createdAt: new Date(),
      ...data,
    };
    this.executionLogs.push(log);
    return log;
  }

  findLogsByLevel(level: 'INFO' | 'WARN' | 'ERROR'): MockExecutionLog[] {
    return this.executionLogs.filter(l => l.logLevel === level);
  }

  // ========== Utility ==========
  reset(): void {
    this.users = [];
    this.credentials = [];
    this.strategies = [];
    this.orders = [];
    this.executionLogs = [];
  }

  // 테스트 시나리오 설정 헬퍼
  setupTestScenario(scenario: {
    user?: Partial<MockUser>;
    credentials?: Partial<MockCredentials>;
    strategy?: Partial<MockStrategy>;
    orders?: Array<Partial<MockOrder>>;
  }): {
    user: MockUser;
    credentials: MockCredentials;
    strategy: MockStrategy;
    orders: MockOrder[];
  } {
    const user = this.createUser({
      email: scenario.user?.email || 'test@test.com',
      name: scenario.user?.name || 'Test User',
    });

    const credentials = this.createCredentials({
      userId: user.id,
      appKey: scenario.credentials?.appKey || 'test-app-key',
      appSecret: scenario.credentials?.appSecret || 'test-app-secret',
      accountNumber: scenario.credentials?.accountNumber || '12345678-01',
      isMock: scenario.credentials?.isMock ?? false,
    });

    const strategy = this.createStrategy({
      userId: user.id,
      name: scenario.strategy?.name || 'Test Strategy',
      type: scenario.strategy?.type || 'LOO_LOC',
      status: scenario.strategy?.status || 'ACTIVE',
      symbol: scenario.strategy?.symbol || 'TSLT',
      market: scenario.strategy?.market || 'US',
      parameters: scenario.strategy?.parameters || {
        looEnabled: true,
        locBuyEnabled: true,
        locSellEnabled: true,
        looQty: 1,
        locBuyQty: 1,
        locSellQty: 1,
        targetReturnRate: 5,
        exchangeCode: 'NASD',
      },
      startDate: scenario.strategy?.startDate || new Date(),
      endDate: scenario.strategy?.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastExecutedAt: scenario.strategy?.lastExecutedAt || null,
    });

    const orders: MockOrder[] = (scenario.orders || []).map(o => this.createOrder({
      strategyId: o.strategyId ?? strategy.id,
      userId: o.userId ?? user.id,
      kisOrderId: o.kisOrderId ?? null,
      symbol: o.symbol ?? strategy.symbol,
      side: o.side ?? 'BUY',
      orderType: o.orderType ?? 'LOO',
      quantity: o.quantity ?? 1,
      price: o.price ?? '24.71',
      status: o.status ?? 'SUBMITTED',
      filledQuantity: o.filledQuantity ?? null,
      avgPrice: o.avgPrice ?? null,
      errorMessage: o.errorMessage ?? null,
      submittedAt: o.submittedAt ?? new Date(),
      filledAt: o.filledAt ?? null,
    }));

    return { user, credentials, strategy, orders };
  }
}

// 싱글톤 인스턴스
export const mockDB = new InMemoryDB();

// 테스트 간 DB 초기화
export function resetMockDB(): void {
  mockDB.reset();
}
