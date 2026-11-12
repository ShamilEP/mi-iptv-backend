import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type {
  EncryptedSourceCredential,
  SourceCredentialCipher,
  SourceCredentialSecrets,
} from '../../application/ports/source-credential-cipher.js';

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * AES-256-GCM credential cipher using a KMS-managed DEK
 * (`SOURCE_CREDENTIALS_DATA_KEY`, protected by the env CMK — INF-023).
 * Vendor AWS SDK is not required for Sprint 0; `node:crypto` only.
 */
export class Aes256GcmSourceCredentialCipher implements SourceCredentialCipher {
  private readonly key: Buffer;

  constructor(
    dataKey: Uint8Array,
    private readonly keyId: string,
  ) {
    if (dataKey.byteLength !== KEY_LENGTH) {
      throw new Error(
        `SOURCE_CREDENTIALS_DATA_KEY must decode to ${KEY_LENGTH} bytes`,
      );
    }
    if (keyId.trim() === '') {
      throw new Error('Credential encryption keyId must not be empty');
    }
    this.key = Buffer.from(dataKey);
  }

  encrypt(secrets: SourceCredentialSecrets): EncryptedSourceCredential {
    const plaintext = Buffer.from(
      JSON.stringify(normalizeSecrets(secrets)),
      'utf8',
    );
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([
      Buffer.from([VERSION]),
      iv,
      tag,
      encrypted,
    ]);
    return { ciphertext, keyId: this.keyId };
  }

  decrypt(ciphertext: Uint8Array): SourceCredentialSecrets {
    const buf = Buffer.from(ciphertext);
    if (buf.length < 1 + IV_LENGTH + TAG_LENGTH + 1) {
      throw new Error('Invalid source credential ciphertext');
    }
    if (buf[0] !== VERSION) {
      throw new Error(`Unsupported credential ciphertext version: ${buf[0]}`);
    }
    const iv = buf.subarray(1, 1 + IV_LENGTH);
    const tag = buf.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const encrypted = buf.subarray(1 + IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    return parseSecrets(parsed);
  }
}

/** Decodes a base64-encoded 32-byte DEK from injected secrets. */
export function decodeSourceCredentialsDataKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error('SOURCE_CREDENTIALS_DATA_KEY is empty');
  }
  const key = Buffer.from(trimmed, 'base64');
  if (key.byteLength !== KEY_LENGTH) {
    throw new Error(
      `SOURCE_CREDENTIALS_DATA_KEY must be base64 for ${KEY_LENGTH} bytes`,
    );
  }
  return key;
}

function normalizeSecrets(
  secrets: SourceCredentialSecrets,
): SourceCredentialSecrets {
  const out: {
    username?: string;
    password?: string;
    token?: string;
  } = {};
  if (secrets.username !== undefined && secrets.username !== '') {
    out.username = secrets.username;
  }
  if (secrets.password !== undefined && secrets.password !== '') {
    out.password = secrets.password;
  }
  if (secrets.token !== undefined && secrets.token !== '') {
    out.token = secrets.token;
  }
  if (
    out.username === undefined &&
    out.password === undefined &&
    out.token === undefined
  ) {
    throw new Error(
      'Source credentials must include at least one secret field',
    );
  }
  return out;
}

function parseSecrets(value: unknown): SourceCredentialSecrets {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid source credential plaintext payload');
  }
  const record = value as Record<string, unknown>;
  const out: {
    username?: string;
    password?: string;
    token?: string;
  } = {};
  if (typeof record.username === 'string') {
    out.username = record.username;
  }
  if (typeof record.password === 'string') {
    out.password = record.password;
  }
  if (typeof record.token === 'string') {
    out.token = record.token;
  }
  return out;
}
