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

    // Expect the decrypt function to throw an error
    expect(() => decrypt(invalidEncryptedText)).toThrow('Invalid encrypted text format.');
  });

  it('should throw an error for corrupted data (e.g., wrong authTag)', () => {
    const originalText = 'some data';
    const encryptedText = encrypt(originalText);
    const parts = encryptedText.split(':');
    
    // Tamper with the encrypted part
    const corruptedEncrypted = `${parts[0]}:${parts[1]}:` + '00'.repeat(parts[2].length / 2);

    expect(() => decrypt(corruptedEncrypted)).toThrow('Decryption failed. The key may be incorrect or the data corrupted.');
  });

  it('should work with empty strings', () => {
    const originalText = '';
    const encryptedText = encrypt(originalText);
    const decryptedText = decrypt(encryptedText);

    expect(decryptedText).toBe(originalText);
  });
});
