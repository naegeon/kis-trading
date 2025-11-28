import { users, credentials } from '@/lib/db/schema';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Credentials = InferSelectModel<typeof credentials>;

export type UserWithCredentials = User & {
  credentials: Credentials[];
};
