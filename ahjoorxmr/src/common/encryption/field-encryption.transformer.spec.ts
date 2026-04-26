import {
  encrypt,
  decrypt,
  hmacBlindIndex,
  encryptedTransformer,
} from './field-encryption.transformer';

const TEST_KEY = 'a'.repeat(64); // 32 bytes as hex

describe('field-encryption.transformer', () => {
  beforeEach(() => {
    process.env.DB_FIELD_ENCRYPTION_KEY = TEST_KEY;
    delete process.env.DB_FIELD_ENCRYPTION_KEY_PREVIOUS;
  });

  afterEach(() => {
    delete process.env.DB_FIELD_ENCRYPTION_KEY;
    delete process.env.DB_FIELD_ENCRYPTION_KEY_PREVIOUS;
  });

  describe('encrypt / decrypt round-trip', () => {
    it('decrypts back to original plaintext', () => {
      const plain = 'user@example.com';
      expect(decrypt(encrypt(plain))).toBe(plain);
    });

    it('produces different ciphertext each call (random IV)', () => {
      const plain = 'user@example.com';
      expect(encrypt(plain)).not.toBe(encrypt(plain));
    });

    it('raw ciphertext does not contain plaintext', () => {
      const plain = 'secret@example.com';
      const cipher = encrypt(plain);
      expect(cipher).not.toContain(plain);
      expect(Buffer.from(cipher, 'base64').toString('utf8')).not.toContain(plain);
    });

    it('throws on tampered ciphertext', () => {
      const cipher = encrypt('hello');
      const tampered = cipher.slice(0, -4) + 'XXXX';
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('key rotation', () => {
    it('decrypts legacy rows encrypted with previous key', () => {
      const plain = 'legacy@example.com';
      const oldKey = 'b'.repeat(64);

      // Encrypt with old key
      process.env.DB_FIELD_ENCRYPTION_KEY = oldKey;
      const legacyCipher = encrypt(plain);

      // Rotate: new key becomes current, old key becomes previous
      const newKey = 'c'.repeat(64);
      process.env.DB_FIELD_ENCRYPTION_KEY = newKey;
      process.env.DB_FIELD_ENCRYPTION_KEY_PREVIOUS = oldKey;

      expect(decrypt(legacyCipher)).toBe(plain);
    });

    it('fails when neither key can decrypt', () => {
      const plain = 'test@example.com';
      const oldKey = 'b'.repeat(64);
      process.env.DB_FIELD_ENCRYPTION_KEY = oldKey;
      const cipher = encrypt(plain);

      process.env.DB_FIELD_ENCRYPTION_KEY = 'c'.repeat(64);
      // No previous key set
      expect(() => decrypt(cipher)).toThrow();
    });
  });

  describe('hmacBlindIndex', () => {
    it('returns same value for same input', () => {
      expect(hmacBlindIndex('User@Example.COM')).toBe(hmacBlindIndex('user@example.com'));
    });

    it('returns different values for different inputs', () => {
      expect(hmacBlindIndex('a@example.com')).not.toBe(hmacBlindIndex('b@example.com'));
    });

    it('returns a 64-char hex string', () => {
      const result = hmacBlindIndex('test@example.com');
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('encryptedTransformer', () => {
    it('to() returns null for null input', () => {
      expect(encryptedTransformer.to(null)).toBeNull();
      expect(encryptedTransformer.to(undefined)).toBeNull();
    });

    it('from() returns null for null input', () => {
      expect(encryptedTransformer.from(null)).toBeNull();
      expect(encryptedTransformer.from(undefined)).toBeNull();
    });

    it('round-trips through to() and from()', () => {
      const plain = 'test@example.com';
      const stored = encryptedTransformer.to(plain)!;
      expect(encryptedTransformer.from(stored)).toBe(plain);
    });

    it('from() returns raw value for unencryptable legacy plaintext', () => {
      // A short plaintext that cannot be valid ciphertext
      const legacy = 'plaintext';
      // Temporarily break the key so decrypt always throws
      process.env.DB_FIELD_ENCRYPTION_KEY = 'z'.repeat(64);
      expect(encryptedTransformer.from(legacy)).toBe(legacy);
    });
  });
});
