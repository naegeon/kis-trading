import { encrypt, decrypt } from './encryption';

describe('Encryption Utility', () => {
  it('should encrypt and then decrypt a string successfully', () => {
    const originalText = 'This is a secret message for KIS Trader!';
    const encryptedText = encrypt(originalText);
    const decryptedText = decrypt(encryptedText);

    // The decrypted text should match the original text
    expect(decryptedText).toBe(originalText);

    // The encrypted text should not be the same as the original text
    expect(encryptedText).not.toBe(originalText);
  });

  it('should throw an error when trying to decrypt with invalid format', () => {
    const invalidEncryptedText = 'invalid-format';

    // Expect the decrypt function to throw an error (updated error message)
    expect(() => decrypt(invalidEncryptedText)).toThrow('Invalid encrypted data format. Expected format: iv:authTag:encryptedData');
  });

  it('should throw an error for corrupted data (e.g., wrong authTag)', () => {
    const originalText = 'some data';
    const encryptedText = encrypt(originalText);
    const parts = encryptedText.split(':');

    // Tamper with the encrypted part
    const corruptedEncrypted = `${parts[0]}:${parts[1]}:` + '00'.repeat(parts[2].length / 2);

    expect(() => decrypt(corruptedEncrypted)).toThrow('Decryption failed');
  });

  it('should throw error for empty strings', () => {
    // Phase 3: 빈 문자열 검증 강화됨
    expect(() => encrypt('')).toThrow('Encryption input must be a non-empty string');
  });
});
