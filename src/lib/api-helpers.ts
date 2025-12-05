/**
 * API Route Helper Functions
 *
 * Provides common utilities for API routes to reduce code duplication:
 * - Authentication checks
 * - KIS client creation
 * - Standardized response formatting
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { credentials as credentialsTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { KISClient } from '@/lib/kis/client';
import { getDecryptedCredentials, type DecryptedCredentials } from '@/lib/crypto/encryption';
import { api, type ApiResponse } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

export interface AuthenticatedSession {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
}

export interface UserCredentials {
  id: string;
  userId: string;
  appKeyEncrypted: string;
  appSecretEncrypted: string;
  accountNumberEncrypted: string;
  isMock: boolean;
  kisAccessToken: string | null;
  kisTokenExpiresAt: Date | null;
}

export interface AuthContext {
  session: AuthenticatedSession;
  userId: string;
}

export interface AuthWithCredentialsContext extends AuthContext {
  credentials: UserCredentials;
  decryptedCredentials: DecryptedCredentials;
  kisClient: KISClient;
}

export type AuthenticatedHandler<T = unknown> = (
  request: NextRequest,
  context: AuthContext
) => Promise<NextResponse<ApiResponse<T>>>;

export type AuthWithCredentialsHandler<T = unknown> = (
  request: NextRequest,
  context: AuthWithCredentialsContext
) => Promise<NextResponse<ApiResponse<T>>>;

// ============================================================================
// Authentication Helpers
// ============================================================================

/**
 * Checks if the user is authenticated and returns the session.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session as AuthenticatedSession;
}

/**
 * Gets the authenticated user ID or returns an error response.
 * Use this for simple auth checks.
 */
export async function requireAuth(): Promise<
  { success: true; session: AuthenticatedSession; userId: string } |
  { success: false; response: NextResponse<ApiResponse<null>> }
> {
  const session = await getAuthenticatedSession();
  if (!session) {
    return {
      success: false,
      response: api.error('Unauthorized', 401),
    };
  }
  return {
    success: true,
    session,
    userId: session.user.id,
  };
}

// ============================================================================
// Credentials Helpers
// ============================================================================

/**
 * Fetches user credentials from the database.
 * Returns null if not found.
 */
export async function getUserCredentials(userId: string): Promise<UserCredentials | null> {
  const userCredentials = await db.query.credentials.findFirst({
    where: eq(credentialsTable.userId, userId),
  });

  if (!userCredentials) {
    return null;
  }

  return userCredentials as UserCredentials;
}

/**
 * Gets user credentials or returns an error response.
 */
export async function requireCredentials(userId: string): Promise<
  { success: true; credentials: UserCredentials } |
  { success: false; response: NextResponse<ApiResponse<null>> }
> {
  const userCredentials = await getUserCredentials(userId);
  if (!userCredentials) {
    return {
      success: false,
      response: api.error('KIS API credentials not found. Please register your API keys in Settings.', 404),
    };
  }
  return {
    success: true,
    credentials: userCredentials,
  };
}

// ============================================================================
// KIS Client Factory
// ============================================================================

/**
 * Creates a KIS client from decrypted credentials.
 */
export function createKISClient(decryptedCreds: DecryptedCredentials): KISClient {
  return new KISClient({
    appkey: decryptedCreds.appKey,
    appsecret: decryptedCreds.appSecret,
    isMock: decryptedCreds.isMock,
    accountNumber: decryptedCreds.accountNumber,
    credentialsId: decryptedCreds.credentialsId,
  });
}

/**
 * Creates a KIS client for a user by fetching and decrypting their credentials.
 * Returns the client along with the decrypted credentials and raw credentials.
 *
 * @example
 * ```typescript
 * const result = await createKISClientForUser(userId);
 * if (!result.success) {
 *   return result.response;
 * }
 * const { kisClient, decryptedCredentials } = result;
 * ```
 */
export async function createKISClientForUser(userId: string): Promise<
  {
    success: true;
    kisClient: KISClient;
    credentials: UserCredentials;
    decryptedCredentials: DecryptedCredentials;
  } |
  { success: false; response: NextResponse<ApiResponse<null>> }
> {
  const credentialsResult = await requireCredentials(userId);
  if (!credentialsResult.success) {
    return credentialsResult;
  }

  try {
    const decryptedCredentials = getDecryptedCredentials(credentialsResult.credentials);
    const kisClient = createKISClient(decryptedCredentials);

    return {
      success: true,
      kisClient,
      credentials: credentialsResult.credentials,
      decryptedCredentials,
    };
  } catch (error) {
    console.error('Failed to decrypt credentials:', error);
    return {
      success: false,
      response: api.error('Failed to decrypt API credentials. Please re-register your API keys.', 500),
    };
  }
}

// ============================================================================
// Combined Auth + Credentials Helper
// ============================================================================

/**
 * Performs authentication check and fetches user credentials with KIS client.
 * This is the most common pattern in API routes.
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const authResult = await requireAuthWithCredentials();
 *   if (!authResult.success) {
 *     return authResult.response;
 *   }
 *
 *   const { userId, kisClient, session } = authResult;
 *   // Use kisClient to make API calls...
 * }
 * ```
 */
export async function requireAuthWithCredentials(): Promise<
  {
    success: true;
    session: AuthenticatedSession;
    userId: string;
    credentials: UserCredentials;
    decryptedCredentials: DecryptedCredentials;
    kisClient: KISClient;
  } |
  { success: false; response: NextResponse<ApiResponse<null>> }
> {
  // Check authentication
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult;
  }

  // Get credentials and create KIS client
  const clientResult = await createKISClientForUser(authResult.userId);
  if (!clientResult.success) {
    return clientResult;
  }

  return {
    success: true,
    session: authResult.session,
    userId: authResult.userId,
    credentials: clientResult.credentials,
    decryptedCredentials: clientResult.decryptedCredentials,
    kisClient: clientResult.kisClient,
  };
}

// ============================================================================
// Higher-Order Function Wrappers (Optional Alternative Pattern)
// ============================================================================

/**
 * Wraps an API handler with authentication check.
 * The handler receives the authenticated context.
 *
 * @example
 * ```typescript
 * export const GET = withAuth(async (request, { userId, session }) => {
 *   // Handler code here...
 *   return api.success(data);
 * });
 * ```
 */
export function withAuth<T = unknown>(
  handler: AuthenticatedHandler<T>
): (request: NextRequest) => Promise<NextResponse<ApiResponse<T | null>>> {
  return async (request: NextRequest) => {
    try {
      const authResult = await requireAuth();
      if (!authResult.success) {
        return authResult.response;
      }

      return await handler(request, {
        session: authResult.session,
        userId: authResult.userId,
      });
    } catch (error) {
      console.error('API handler error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      return api.error(errorMessage, 500);
    }
  };
}

/**
 * Wraps an API handler with authentication and credentials check.
 * The handler receives the full context including KIS client.
 *
 * @example
 * ```typescript
 * export const GET = withAuthAndCredentials(async (request, { userId, kisClient }) => {
 *   const balance = await kisClient.getAccountBalance();
 *   return api.success(balance);
 * });
 * ```
 */
export function withAuthAndCredentials<T = unknown>(
  handler: AuthWithCredentialsHandler<T>
): (request: NextRequest) => Promise<NextResponse<ApiResponse<T | null>>> {
  return async (request: NextRequest) => {
    try {
      const result = await requireAuthWithCredentials();
      if (!result.success) {
        return result.response;
      }

      return await handler(request, {
        session: result.session,
        userId: result.userId,
        credentials: result.credentials,
        decryptedCredentials: result.decryptedCredentials,
        kisClient: result.kisClient,
      });
    } catch (error) {
      console.error('API handler error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      return api.error(errorMessage, 500);
    }
  };
}

// ============================================================================
// Admin Authorization
// ============================================================================

/**
 * Checks if the authenticated user is an admin.
 * Admin is determined by ADMIN_EMAIL environment variable.
 */
export async function requireAdmin(): Promise<
  { success: true; session: AuthenticatedSession; userId: string } |
  { success: false; response: NextResponse<ApiResponse<null>> }
> {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult;
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  // If ADMIN_EMAIL is not set, allow all authenticated users (development mode)
  if (adminEmail && authResult.session.user.email !== adminEmail) {
    return {
      success: false,
      response: api.error('Forbidden: Admin access required', 403),
    };
  }

  return authResult;
}
