import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;


const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// 암호화 키 검증
if (!ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is not set');
}

// 64자 hex 문자열 검증 (32 바이트)
if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
  throw new Error(
    'ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes). ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

const key = Buffer.from(ENCRYPTION_KEY, 'hex');

/**
 * Encrypts a given text using AES-256-GCM.
 * @param text The text to encrypt.
 * @returns A string containing the iv, auth tag, and encrypted text, separated by ':'.
 */
export function encrypt(text: string): string {
  // 입력 검증
  if (!text || typeof text !== 'string') {
    throw new Error('Encryption input must be a non-empty string');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine iv, authTag, and encrypted data into a single string for storage
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a given string that was encrypted with the encrypt function.
 * @param encryptedText The encrypted text string (iv:authTag:encryptedData).
 * @returns The original decrypted text.
 */
export function decrypt(encryptedText: string): string {
  // 입력 검증
  if (!encryptedText || typeof encryptedText !== 'string') {
    throw new Error('Decryption input must be a non-empty string');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format. Expected format: iv:authTag:encryptedData');
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption failed:', error);
    // In a real application, you might want to handle this more gracefully
    // For now, we re-throw to make it clear that decryption failed.
    throw new Error('Decryption failed. The key may be incorrect or the data corrupted.');
  }
}

interface EncryptedCredentials {
  id?: string; // credentials ID for DB token caching
  appKeyEncrypted: string | null;
  appSecretEncrypted: string | null;
  accountNumberEncrypted: string | null;
  isMock: boolean | null;
}

export interface DecryptedCredentials {
  credentialsId?: string; // for DB token caching
  appKey: string;
  appSecret: string;
  accountNumber: string;
  isMock: boolean;
}

/**
 * Decrypts the fields of a credentials object.
 * @param cred The encrypted credentials object.
 * @returns An object with the decrypted credential values.
 */
export function getDecryptedCredentials(cred: EncryptedCredentials): DecryptedCredentials {
    if (!cred.appKeyEncrypted || !cred.appSecretEncrypted || !cred.accountNumberEncrypted) {
        throw new Error("User credentials are not complete or are invalid.");
    }
    return {
        credentialsId: cred.id,
        appKey: decrypt(cred.appKeyEncrypted),
        appSecret: decrypt(cred.appSecretEncrypted),
        accountNumber: decrypt(cred.accountNumberEncrypted),
        isMock: cred.isMock ?? true,
    };
}