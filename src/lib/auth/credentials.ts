import 'server-only';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export async function authorize(
  credentials: Partial<Record<'email' | 'password', unknown>>,
  _request: Request
) {
  if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') {
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, credentials.email),
  });

  if (!user || !user.passwordHash) {
    return null;
  }

  const isValidPassword = await bcrypt.compare(
    credentials.password,
    user.passwordHash
  );

  if (!isValidPassword) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}