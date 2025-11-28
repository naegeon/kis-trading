import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { credentials } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto/encryption';
import { api } from '@/lib/api';
import { z } from 'zod';

// API 라우트는 항상 동적으로 실행되어야 함
export const dynamic = 'force-dynamic';

const credentialsSchema = z.object({
  appKey: z.string().min(1, 'App Key is required').optional(),
  appSecret: z.string().min(1, 'App Secret is required').optional(),
  accountNumber: z.string().min(1, 'Account Number is required').optional(),
  isMock: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const credentialId = params.id;

  try {
    const body = await request.json();
    const parsedCredentials = credentialsSchema.parse(body);

    const updateData: Record<string, string | boolean | Date> = {};
    if (parsedCredentials.appKey) {
      updateData.appKeyEncrypted = encrypt(parsedCredentials.appKey);
    }
    if (parsedCredentials.appSecret) {
      updateData.appSecretEncrypted = encrypt(parsedCredentials.appSecret);
    }
    if (parsedCredentials.accountNumber) {
      updateData.accountNumberEncrypted = encrypt(parsedCredentials.accountNumber);
    }
    if (parsedCredentials.isMock !== undefined) {
      updateData.isMock = parsedCredentials.isMock;
    }
    updateData.updatedAt = new Date();

    const [updatedCredentials] = await db.update(credentials)
      .set(updateData)
      .where(and(eq(credentials.id, credentialId), eq(credentials.userId, session.user.id)))
      .returning();

    if (!updatedCredentials) {
      return api.error('Credentials not found or you do not have permission', 404);
    }

    return api.success(updatedCredentials);
  } catch (error) {
    console.error('Error updating credentials:', error);
    if (error instanceof z.ZodError) {
      return api.error(error.errors[0].message, 400);
    }
    return api.error('Failed to update credentials', 500);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return api.error('Unauthorized', 401);
  }

  const credentialId = params.id;

  try {
    const [deletedCredentials] = await db.delete(credentials)
      .where(and(eq(credentials.id, credentialId), eq(credentials.userId, session.user.id)))
      .returning();

    if (!deletedCredentials) {
      return api.error('Credentials not found or you do not have permission', 404);
    }

    return api.success({ message: 'Credentials deleted successfully' });
  } catch (error) {
    console.error('Error deleting credentials:', error);
    return api.error('Failed to delete credentials', 500);
  }
}
