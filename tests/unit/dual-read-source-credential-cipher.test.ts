import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import {
  DualReadSourceCredentialCipher,
  reencryptSourceCredentialCiphertext,
} from '../../src/infrastructure/crypto/dual-read-source-credential-cipher.js';

describe('DualReadSourceCredentialCipher (SEC-030 rotation drill)', () => {
  const oldKeyId = 'arn:aws:kms:us-east-1:000000000001:key/mock-old';
  const newKeyId = 'arn:aws:kms:us-east-1:000000000001:key/mock-new';
  const oldDek = randomBytes(32);
  const newDek = randomBytes(32);

  it('decrypts ciphertext from the previous DEK during dual-read', () => {
    const previous = new Aes256GcmSourceCredentialCipher(oldDek, oldKeyId);
    const primary = new Aes256GcmSourceCredentialCipher(newDek, newKeyId);
    const dual = new DualReadSourceCredentialCipher(primary, previous);

    const legacy = previous.encrypt({
      username: 'u',
      password: 'rotate-me',
    });
    assert.deepEqual(dual.decrypt(legacy.ciphertext), {
      username: 'u',
      password: 'rotate-me',
    });

    const fresh = dual.encrypt({ token: 'new-token' });
    assert.equal(fresh.keyId, newKeyId);
    assert.deepEqual(primary.decrypt(fresh.ciphertext), { token: 'new-token' });
  });

  it('re-encrypts rows onto the new DEK (rotation drill step)', () => {
    const previous = new Aes256GcmSourceCredentialCipher(oldDek, oldKeyId);
    const primary = new Aes256GcmSourceCredentialCipher(newDek, newKeyId);
    const dual = new DualReadSourceCredentialCipher(primary, previous);

    const legacy = previous.encrypt({ password: 'legacy-secret' });
    const rotated = reencryptSourceCredentialCiphertext(
      legacy.ciphertext,
      dual,
      primary,
    );

    assert.equal(rotated.keyId, newKeyId);
    assert.deepEqual(primary.decrypt(rotated.ciphertext), {
      password: 'legacy-secret',
    });
    assert.throws(() => previous.decrypt(rotated.ciphertext));
  });
});
