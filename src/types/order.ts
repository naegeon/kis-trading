import { orders, orderSideEnum, orderTypeEnum, orderStatusEnum } from '@/lib/db/schema';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// Status Enum Type
export type OrderStatus = typeof orderStatusEnum.enumValues[number];

// Inferred types from the 'orders' table
export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;

// Type for parameters needed to submit an order via KIS API
export type OrderParams = {
  symbol: string;
  side: (typeof orderSideEnum.enumValues)[number];
  orderType: (typeof orderTypeEnum.enumValues)[number];
  quantity: number;
  price?: number; // Optional for market orders
};

export interface LooLocOrderToSubmit {
  orderType: (typeof orderTypeEnum.enumValues)[number];
  side: (typeof orderSideEnum.enumValues)[number];
  quantity: number;
  price?: number;
  message: string;
}
