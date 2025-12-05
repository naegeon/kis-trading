import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  varchar,
  uuid,
  boolean,
  jsonb,
  pgEnum,
  decimal,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { AdapterAccount } from 'next-auth/adapters';

// Enum Definitions from DEVELOPMENT_PLAN.md
export const marketTypeEnum = pgEnum('market_type', ['US', 'KR']);
export const strategyTypeEnum = pgEnum('strategy_type', ['SPLIT_ORDER', 'LOO_LOC']);
export const strategyStatusEnum = pgEnum('strategy_status', ['ACTIVE', 'INACTIVE', 'ENDED']);
export const orderSideEnum = pgEnum('order_side', ['BUY', 'SELL']);
export const orderStatusEnum = pgEnum('order_status', ['SUBMITTED', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'FAILED']);
export const orderTypeEnum = pgEnum('order_type', ['MARKET', 'LIMIT', 'LOO', 'LOC']);
export const logLevelEnum = pgEnum('log_level', ['INFO', 'WARN', 'ERROR']);
export const eventTypeEnum = pgEnum('event_type', [
  'ORDER_SUBMITTED',    // 주문 제출 성공
  'ORDER_FAILED',       // 주문 제출 실패
  'ORDER_FILLED',       // 주문 체결
  'ORDER_CANCELLED',    // 주문 취소
  'STRATEGY_STARTED',   // 전략 시작
  'STRATEGY_ENDED',     // 전략 종료
  'SYSTEM',             // 시스템 이벤트
]);

// Users Table (Based on DEVELOPMENT_PLAN.md and NextAuth requirements)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  passwordHash: varchar('passwordHash', { length: 255 }),
  pushEnabled: boolean('push_enabled').default(false),
  pushSubscription: jsonb('push_subscription'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Credentials Table from DEVELOPMENT_PLAN.md
export const credentials = pgTable('credentials', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    appKeyEncrypted: text('app_key_encrypted').notNull(),
    appSecretEncrypted: text('app_secret_encrypted').notNull(),
    accountNumberEncrypted: text('account_number_encrypted').notNull(),
    isMock: boolean('is_mock').notNull().default(true),
    // KIS API 토큰 캐싱 (서버리스 환경 대응)
    kisAccessToken: text('kis_access_token'), // 암호화된 접근 토큰
    kisTokenExpiresAt: timestamp('kis_token_expires_at'), // 토큰 만료 시간
});

// Standard NextAuth.js Adapter Tables
export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccount['type']>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').notNull().primaryKey(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// --- Relations for Tables ---

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  credentials: many(credentials),
  strategies: many(strategies),
  orders: many(orders),
  executionLogs: many(executionLogs),
  performanceMetrics: many(performanceMetrics),
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
  user: one(users, {
    fields: [credentials.userId],
    references: [users.id],
  }),
}));

// Strategies Table from DEVELOPMENT_PLAN.md
export const strategies = pgTable('strategies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: strategyTypeEnum('type').notNull(),
  status: strategyStatusEnum('status').default('INACTIVE'),
  symbol: varchar('symbol', { length: 50 }).notNull(),
  market: marketTypeEnum('market').notNull().default('US'),
  parameters: jsonb('parameters').notNull(),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  lastExecutedAt: timestamp('last_executed_at'), // 마지막 실행 시간 (중복 방지용)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userStatusIdx: index('strategies_user_status_idx').on(table.userId, table.status),
}));

export const strategiesRelations = relations(strategies, ({ one, many }) => ({
  user: one(users, {
    fields: [strategies.userId],
    references: [users.id],
  }),
  orders: many(orders),
  executionLogs: many(executionLogs),
  performanceMetrics: many(performanceMetrics),
}));

// Orders Table from DEVELOPMENT_PLAN.md
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  strategyId: uuid('strategy_id').references(() => strategies.id, { onDelete: 'set null' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kisOrderId: text('kis_order_id'),
  symbol: varchar('symbol', { length: 50 }).notNull(),
  side: orderSideEnum('side').notNull(),
  orderType: orderTypeEnum('order_type').notNull(),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }),
  status: orderStatusEnum('status').notNull().default('SUBMITTED'),
  filledQuantity: integer('filled_quantity'),
  avgPrice: decimal('avg_price', { precision: 10, scale: 2 }),
  errorMessage: text('error_message'),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
  filledAt: timestamp('filled_at'),
}, (table) => ({
  strategyStatusIdx: index('orders_strategy_status_idx').on(table.strategyId, table.status),
  userSubmittedAtIdx: index('orders_user_submitted_at_idx').on(table.userId, table.submittedAt),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  strategy: one(strategies, {
    fields: [orders.strategyId],
    references: [strategies.id],
  }),
}));

// ExecutionLogs Table from DEVELOPMENT_PLAN.md
export const executionLogs = pgTable('execution_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  strategyId: uuid('strategy_id').references(() => strategies.id, { onDelete: 'set null' }),
  logLevel: logLevelEnum('log_level').notNull(),
  eventType: eventTypeEnum('event_type'), // 이벤트 타입 (주문, 전략 등) - nullable for backward compatibility
  message: text('message').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const executionLogsRelations = relations(executionLogs, ({ one }) => ({
  user: one(users, {
    fields: [executionLogs.userId],
    references: [users.id],
  }),
  strategy: one(strategies, {
    fields: [executionLogs.strategyId],
    references: [strategies.id],
  }),
}));

// PerformanceMetrics Table from DEVELOPMENT_PLAN.md
export const performanceMetrics = pgTable('performance_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  strategyId: uuid('strategy_id').references(() => strategies.id, { onDelete: 'cascade' }),
  date: timestamp('date', { mode: 'date' }).notNull(),
  totalInvested: decimal('total_invested', { precision: 15, scale: 2 }),
  totalValue: decimal('total_value', { precision: 15, scale: 2 }),
  realizedPnl: decimal('realized_pnl', { precision: 15, scale: 2 }),
  unrealizedPnl: decimal('unrealized_pnl', { precision: 15, scale: 2 }),
  returnRate: decimal('return_rate', { precision: 10, scale: 4 }),
  tradeCount: integer('trade_count'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueConstraint: unique().on(table.userId, table.strategyId, table.date),
}));

export const performanceMetricsRelations = relations(performanceMetrics, ({ one }) => ({
  user: one(users, {
    fields: [performanceMetrics.userId],
    references: [users.id],
  }),
  strategy: one(strategies, {
    fields: [performanceMetrics.strategyId],
    references: [strategies.id],
  }),
}));

// Stock Symbols Cache Table (for exchange code lookup)
export const stockSymbols = pgTable('stock_symbols', {
  id: uuid('id').primaryKey().defaultRandom(),
  symbol: varchar('symbol', { length: 50 }).notNull(),
  market: marketTypeEnum('market').notNull().default('US'),
  exchangeCode: varchar('exchange_code', { length: 10 }).notNull(), // NASD, NYSE, AMEX, etc.
  name: varchar('name', { length: 255 }), // 종목명 (선택)
  isActive: boolean('is_active').default(true), // 거래 가능 여부
  lastVerified: timestamp('last_verified').defaultNow(), // 마지막 검증 시간
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  // 같은 시장의 같은 심볼은 유니크
  uniqueSymbolMarket: unique().on(table.symbol, table.market),
  // 심볼 검색을 위한 인덱스
  symbolIdx: index('stock_symbols_symbol_idx').on(table.symbol),
}));