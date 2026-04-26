import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENCODING = 'base64' as const;

function getKey(envVar: string): Buffer {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`Missing env var: ${envVar}`);
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) throw new Error(`${envVar} must be 32 bytes (64 hex chars)`);
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = getKey('DB_FIELD_ENCRYPTION_KEY');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString(ENCODING);
}

export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, ENCODING);
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const tryDecrypt = (key: Buffer): string | null => {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(encrypted) + decipher.final('utf8');
    } catch {
      return null;
    }
  };

  const result = tryDecrypt(getKey('DB_FIELD_ENCRYPTION_KEY'));
  if (result !== null) return result;

  const prevRaw = process.env['DB_FIELD_ENCRYPTION_KEY_PREVIOUS'];
  if (prevRaw) {
    const prevKey = Buffer.from(prevRaw, 'hex');
    if (prevKey.length === 32) {
      const prevResult = tryDecrypt(prevKey);
      if (prevResult !== null) return prevResult;
    }
  }

  throw new Error('Failed to decrypt field: invalid key or corrupted data');
}

export function hmacBlindIndex(value: string): string {
  const secret = process.env['DB_FIELD_ENCRYPTION_KEY'];
  if (!secret) throw new Error('Missing DB_FIELD_ENCRYPTION_KEY for blind index');
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(value.toLowerCase())
    .digest('hex');
}

/**
 * TypeORM ValueTransformer for AES-256-GCM encrypted columns.
 * Falls back to returning raw value for unencrypted legacy rows.
 */
export const encryptedTransformer = {
  to(value: string | null | undefined): string | null {
    if (value == null) return null;
    return encrypt(value);
  },
  from(value: string | null | undefined): string | null {
    if (value == null) return null;
    try {
      return decrypt(value);
    } catch {
      return value;
    }
  },
};
