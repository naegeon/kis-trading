/**
 * Tests for API Route Helper Functions
 */

import { NextRequest } from 'next/server';

// Mock the auth module
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

// Mock the db module
jest.mock('@/lib/db/client', () => ({
  db: {
    query: {
      credentials: {
        findFirst: jest.fn(),
      },
    },
  },
}));

// Mock the encryption module
jest.mock('@/lib/crypto/encryption', () => ({
  getDecryptedCredentials: jest.fn(),
}));

// Mock the KIS client
jest.mock('@/lib/kis/client', () => ({
  KISClient: jest.fn().mockImplementation((config) => ({
    config,
    getAccountBalance: jest.fn(),
  })),
}));

import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { getDecryptedCredentials } from '@/lib/crypto/encryption';
import {
  getAuthenticatedSession,
  requireAuth,
  getUserCredentials,
  requireCredentials,
  createKISClient,
  createKISClientForUser,
  requireAuthWithCredentials,
  withAuth,
  withAuthAndCredentials,
  requireAdmin,
} from './api-helpers';
import { api } from './api';

describe('API Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Authentication Helpers
  // =========================================================================

  describe('getAuthenticatedSession', () => {
    it('should return session when user is authenticated', async () => {
      const mockSession = { user: { id: 'user-123', email: 'test@example.com' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);

      const result = await getAuthenticatedSession();

      expect(result).toEqual(mockSession);
    });

    it('should return null when session is null', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getAuthenticatedSession();

      expect(result).toBeNull();
    });

    it('should return null when user.id is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { email: 'test@example.com' } });

      const result = await getAuthenticatedSession();

      expect(result).toBeNull();
    });
  });

  describe('requireAuth', () => {
    it('should return success with session when authenticated', async () => {
      const mockSession = { user: { id: 'user-123', email: 'test@example.com' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);

      const result = await requireAuth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.session).toEqual(mockSession);
        expect(result.userId).toBe('user-123');
      }
    });

    it('should return error response when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await requireAuth();

      expect(result.success).toBe(false);
      if (!result.success) {
        const json = await result.response.json();
        expect(json.success).toBe(false);
        expect(json.message).toBe('Unauthorized');
        expect(result.response.status).toBe(401);
      }
    });
  });

  // =========================================================================
  // Credentials Helpers
  // =========================================================================

  describe('getUserCredentials', () => {
    it('should return credentials when found', async () => {
      const mockCredentials = {
        id: 'cred-123',
        userId: 'user-123',
        appKeyEncrypted: 'encrypted-key',
        appSecretEncrypted: 'encrypted-secret',
        accountNumberEncrypted: 'encrypted-account',
        isMock: true,
      };
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(mockCredentials);

      const result = await getUserCredentials('user-123');

      expect(result).toEqual(mockCredentials);
    });

    it('should return null when credentials not found', async () => {
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await getUserCredentials('user-123');

      expect(result).toBeNull();
    });
  });

  describe('requireCredentials', () => {
    it('should return success with credentials when found', async () => {
      const mockCredentials = {
        id: 'cred-123',
        userId: 'user-123',
        appKeyEncrypted: 'encrypted-key',
        appSecretEncrypted: 'encrypted-secret',
        accountNumberEncrypted: 'encrypted-account',
        isMock: true,
      };
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(mockCredentials);

      const result = await requireCredentials('user-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.credentials).toEqual(mockCredentials);
      }
    });

    it('should return error response when credentials not found', async () => {
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await requireCredentials('user-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        const json = await result.response.json();
        expect(json.success).toBe(false);
        expect(json.message).toContain('credentials not found');
        expect(result.response.status).toBe(404);
      }
    });
  });

  // =========================================================================
  // KIS Client Factory
  // =========================================================================

  describe('createKISClient', () => {
    it('should create a KIS client with decrypted credentials', () => {
      const decryptedCreds = {
        credentialsId: 'cred-123',
        appKey: 'app-key',
        appSecret: 'app-secret',
        accountNumber: '12345678-01',
        isMock: true,
      };

      const client = createKISClient(decryptedCreds);

      expect(client).toBeDefined();
      expect(client.config).toEqual({
        appkey: 'app-key',
        appsecret: 'app-secret',
        isMock: true,
        accountNumber: '12345678-01',
        credentialsId: 'cred-123',
      });
    });
  });

  describe('createKISClientForUser', () => {
    it('should create KIS client when credentials exist', async () => {
      const mockCredentials = {
        id: 'cred-123',
        userId: 'user-123',
        appKeyEncrypted: 'encrypted-key',
        appSecretEncrypted: 'encrypted-secret',
        accountNumberEncrypted: 'encrypted-account',
        isMock: true,
      };
      const mockDecrypted = {
        credentialsId: 'cred-123',
        appKey: 'app-key',
        appSecret: 'app-secret',
        accountNumber: '12345678-01',
        isMock: true,
      };

      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(mockCredentials);
      (getDecryptedCredentials as jest.Mock).mockReturnValue(mockDecrypted);

      const result = await createKISClientForUser('user-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.kisClient).toBeDefined();
        expect(result.credentials).toEqual(mockCredentials);
        expect(result.decryptedCredentials).toEqual(mockDecrypted);
      }
    });

    it('should return error when credentials not found', async () => {
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await createKISClientForUser('user-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(404);
      }
    });

    it('should return error when decryption fails', async () => {
      const mockCredentials = {
        id: 'cred-123',
        userId: 'user-123',
        appKeyEncrypted: 'encrypted-key',
        appSecretEncrypted: 'encrypted-secret',
        accountNumberEncrypted: 'encrypted-account',
        isMock: true,
      };

      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(mockCredentials);
      (getDecryptedCredentials as jest.Mock).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const result = await createKISClientForUser('user-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        const json = await result.response.json();
        expect(json.message).toContain('decrypt');
        expect(result.response.status).toBe(500);
      }
    });
  });

  // =========================================================================
  // Combined Auth + Credentials Helper
  // =========================================================================

  describe('requireAuthWithCredentials', () => {
    it('should return full context when authenticated with credentials', async () => {
      const mockSession = { user: { id: 'user-123', email: 'test@example.com' } };
      const mockCredentials = {
        id: 'cred-123',
        userId: 'user-123',
        appKeyEncrypted: 'encrypted-key',
        appSecretEncrypted: 'encrypted-secret',
        accountNumberEncrypted: 'encrypted-account',
        isMock: true,
      };
      const mockDecrypted = {
        credentialsId: 'cred-123',
        appKey: 'app-key',
        appSecret: 'app-secret',
        accountNumber: '12345678-01',
        isMock: true,
      };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(mockCredentials);
      (getDecryptedCredentials as jest.Mock).mockReturnValue(mockDecrypted);

      const result = await requireAuthWithCredentials();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.session).toEqual(mockSession);
        expect(result.userId).toBe('user-123');
        expect(result.credentials).toEqual(mockCredentials);
        expect(result.decryptedCredentials).toEqual(mockDecrypted);
        expect(result.kisClient).toBeDefined();
      }
    });

    it('should return error when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await requireAuthWithCredentials();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(401);
      }
    });

    it('should return error when credentials not found', async () => {
      const mockSession = { user: { id: 'user-123', email: 'test@example.com' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await requireAuthWithCredentials();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(404);
      }
    });
  });

  // =========================================================================
  // Higher-Order Function Wrappers
  // =========================================================================

  describe('withAuth', () => {
    it('should call handler with auth context when authenticated', async () => {
      const mockSession = { user: { id: 'user-123', email: 'test@example.com' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);

      const handler = jest.fn().mockResolvedValue(api.success({ test: 'data' }));
      const wrappedHandler = withAuth(handler);

      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, {
        session: mockSession,
        userId: 'user-123',
      });

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ test: 'data' });
    });

    it('should return 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const handler = jest.fn();
      const wrappedHandler = withAuth(handler);

      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await wrappedHandler(request);

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
    });

    it('should catch handler errors and return 500', async () => {
      const mockSession = { user: { id: 'user-123' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);

      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const wrappedHandler = withAuth(handler);

      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toBe('Handler error');
    });
  });

  describe('withAuthAndCredentials', () => {
    it('should call handler with full context when authenticated with credentials', async () => {
      const mockSession = { user: { id: 'user-123', email: 'test@example.com' } };
      const mockCredentials = {
        id: 'cred-123',
        userId: 'user-123',
        appKeyEncrypted: 'encrypted-key',
        appSecretEncrypted: 'encrypted-secret',
        accountNumberEncrypted: 'encrypted-account',
        isMock: true,
      };
      const mockDecrypted = {
        credentialsId: 'cred-123',
        appKey: 'app-key',
        appSecret: 'app-secret',
        accountNumber: '12345678-01',
        isMock: true,
      };

      (auth as jest.Mock).mockResolvedValue(mockSession);
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(mockCredentials);
      (getDecryptedCredentials as jest.Mock).mockReturnValue(mockDecrypted);

      const handler = jest.fn().mockResolvedValue(api.success({ balance: 1000 }));
      const wrappedHandler = withAuthAndCredentials(handler);

      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, expect.objectContaining({
        session: mockSession,
        userId: 'user-123',
        credentials: mockCredentials,
        decryptedCredentials: mockDecrypted,
      }));

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ balance: 1000 });
    });

    it('should return 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const handler = jest.fn();
      const wrappedHandler = withAuthAndCredentials(handler);

      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await wrappedHandler(request);

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
    });

    it('should return 404 when credentials not found', async () => {
      const mockSession = { user: { id: 'user-123' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (db.query.credentials.findFirst as jest.Mock).mockResolvedValue(null);

      const handler = jest.fn();
      const wrappedHandler = withAuthAndCredentials(handler);

      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await wrappedHandler(request);

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // Admin Authorization
  // =========================================================================

  describe('requireAdmin', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return success when user is admin', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      const mockSession = { user: { id: 'user-123', email: 'admin@example.com' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);

      const result = await requireAdmin();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe('user-123');
      }
    });

    it('should return forbidden when user is not admin', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      const mockSession = { user: { id: 'user-123', email: 'user@example.com' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);

      const result = await requireAdmin();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(403);
        const json = await result.response.json();
        expect(json.message).toContain('Admin');
      }
    });

    it('should allow all authenticated users when ADMIN_EMAIL is not set', async () => {
      delete process.env.ADMIN_EMAIL;
      const mockSession = { user: { id: 'user-123', email: 'anyone@example.com' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);

      const result = await requireAdmin();

      expect(result.success).toBe(true);
    });

    it('should return 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await requireAdmin();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(401);
      }
    });
  });
});

// =========================================================================
// API Response Helper Tests
// =========================================================================

describe('API Response Helpers', () => {
  describe('api.success', () => {
    it('should return 200 with data', async () => {
      const response = api.success({ test: 'data' });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ test: 'data' });
    });

    it('should return custom status code', async () => {
      const response = api.success({ test: 'data' }, { status: 201 });

      expect(response.status).toBe(201);
    });

    it('should include message when provided', async () => {
      const response = api.success({ test: 'data' }, { message: 'Success!' });
      const json = await response.json();

      expect(json.message).toBe('Success!');
    });
  });

  describe('api.created', () => {
    it('should return 201 with data', async () => {
      const response = api.created({ id: '123' });
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: '123' });
    });
  });

  describe('api.error', () => {
    it('should return 500 by default', async () => {
      const response = api.error('Something went wrong');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.message).toBe('Something went wrong');
      expect(json.data).toBeNull();
    });

    it('should return custom status code', async () => {
      const response = api.error('Bad request', 400);

      expect(response.status).toBe(400);
    });
  });

  describe('api.validationError', () => {
    it('should return 400 with details', async () => {
      const details = { field: 'email', error: 'Invalid format' };
      const response = api.validationError('Validation failed', details);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toBe('Validation failed');
      expect(json.details).toEqual(details);
    });
  });

  describe('api.notFound', () => {
    it('should return 404 with resource name', async () => {
      const response = api.notFound('Strategy');
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.message).toBe('Strategy not found');
    });

    it('should use default resource name', async () => {
      const response = api.notFound();
      const json = await response.json();

      expect(json.message).toBe('Resource not found');
    });
  });

  describe('api.unauthorized', () => {
    it('should return 401', async () => {
      const response = api.unauthorized();
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.message).toBe('Unauthorized');
    });
  });

  describe('api.forbidden', () => {
    it('should return 403 with default message', async () => {
      const response = api.forbidden();
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toBe('Forbidden');
    });

    it('should return 403 with custom message', async () => {
      const response = api.forbidden('Admin access required');
      const json = await response.json();

      expect(json.message).toBe('Admin access required');
    });
  });

  describe('api.successWithMeta', () => {
    it('should return data with metadata', async () => {
      const data = [{ id: 1 }, { id: 2 }];
      const meta = { page: 1, limit: 10, total: 100 };
      const response = api.successWithMeta(data, meta);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(data);
      expect(json.meta).toEqual(meta);
    });
  });
});
