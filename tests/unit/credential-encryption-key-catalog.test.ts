import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StaticCredentialEncryptionKeyCatalog } from '../../src/infrastructure/secrets/static-credential-encryption-key-catalog.js';

describe('StaticCredentialEncryptionKeyCatalog', () => {
  it('exposes one distinct key per environment with rotation metadata', () => {
    const catalog = new StaticCredentialEncryptionKeyCatalog({});
    const keys = catalog.list();
    assert.equal(keys.length, 3);

    const ids = new Set(keys.map((key) => key.keyId));
    assert.equal(ids.size, 3);

    for (const key of keys) {
      assert.equal(key.rotationIntervalDays, 365);
      assert.equal(key.automaticCmkRotation, true);
      assert.match(key.alias, /source-credentials/);
    }
  });

  it('allows SOURCE_CREDENTIALS_KMS_KEY_ID override for the active env lookup', () => {
    const catalog = new StaticCredentialEncryptionKeyCatalog({
      SOURCE_CREDENTIALS_KMS_KEY_ID:
        'arn:aws:kms:us-east-1:000000000001:key/override-creds',
    });
    assert.equal(
      catalog.get('dev').keyId,
      'arn:aws:kms:us-east-1:000000000001:key/override-creds',
    );
  });
});
