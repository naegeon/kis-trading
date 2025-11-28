import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { credentials } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt } from '@/lib/crypto/encryption';
import { api } from '@/lib/api';
import { z } from 'zod';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

const credentialsSchema = z.object({
  appKey: z.string().min(1, 'App Key is required'),
  appSecret: z.string().min(1, 'App Secret is required'),
  accountNumber: z.string().min(1, 'Account Number is required'),
  isMock: z.boolean().default(true),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  try {
    const userCredentials = await db.query.credentials.findFirst({
      where: eq(credentials.userId, session.user.id),
    });

    if (!userCredentials || !userCredentials.appKeyEncrypted || !userCredentials.appSecretEncrypted || !userCredentials.accountNumberEncrypted) {
      return api.success(null);
    }

    // Decrypt sensitive fields before sending to client
    const decryptedCredentials = {
      id: userCredentials.id,
      appKey: decrypt(userCredentials.appKeyEncrypted),
      appSecret: decrypt(userCredentials.appSecretEncrypted),
      accountNumber: decrypt(userCredentials.accountNumberEncrypted),
      isMock: userCredentials.isMock,
    };

    return api.success(decryptedCredentials);
  } catch (error) {
    console.error('Error fetching credentials:', error);
    return api.error('Failed to fetch credentials', 500);
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const parsedCredentials = credentialsSchema.parse(body);

    // Encrypt sensitive fields before saving to DB
    const appKeyEncrypted = encrypt(parsedCredentials.appKey);
    const appSecretEncrypted = encrypt(parsedCredentials.appSecret);
    const accountNumberEncrypted = encrypt(parsedCredentials.accountNumber);

    const [newCredentials] = await db.insert(credentials).values({
      userId: session.user.id,
      appKeyEncrypted,
      appSecretEncrypted,
      accountNumberEncrypted,
      isMock: parsedCredentials.isMock,
    }).returning();

    return api.success(newCredentials, { status: 201 });
  } catch (error) {
    console.error('Error creating credentials:', error);
    if (error instanceof z.ZodError) {
      return api.error(error.errors[0].message, 400);
    }
    return api.error('Failed to create credentials', 500);
  }
}
