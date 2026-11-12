import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  Aes256GcmSourceCredentialCipher,
  decodeSourceCredentialsDataKey,
} from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';

describe('Aes256GcmSourceCredentialCipher', () => {
  const keyId = 'arn:aws:kms:us-east-1:000000000001:key/mock-dev-source-creds';
  const dek = randomBytes(32);

  it('round-trips secrets and stores opaque ciphertext', () => {
    const cipher = new Aes256GcmSourceCredentialCipher(dek, keyId);
    const secrets = { username: 'xtream-user', password: 's3cret-value!' };
    const encrypted = cipher.encrypt(secrets);

    assert.equal(encrypted.keyId, keyId);
    assert.ok(encrypted.ciphertext.byteLength > 30);
    assert.equal(
      Buffer.from(encrypted.ciphertext).includes(Buffer.from(secrets.password)),
      false,
    );

    assert.deepEqual(cipher.decrypt(encrypted.ciphertext), secrets);
  });

  it('fails closed on tampered ciphertext', () => {
    const cipher = new Aes256GcmSourceCredentialCipher(dek, keyId);
    const { ciphertext } = cipher.encrypt({ token: 'playlist-token' });
    const tampered = Buffer.from(ciphertext);
    const last = tampered.length - 1;
    tampered[last] = (tampered[last] ?? 0) ^ 0xff;
    assert.throws(() => cipher.decrypt(tampered));
  });

  it('decodes base64 DEK material', () => {
    const raw = dek.toString('base64');
    assert.deepEqual(Buffer.from(decodeSourceCredentialsDataKey(raw)), dek);
  });
});
