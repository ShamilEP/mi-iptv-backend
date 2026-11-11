import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EnvSecretStore } from '../../src/infrastructure/secrets/env-secret-store.js';
import { StaticKmsKeyResolver } from '../../src/infrastructure/secrets/static-kms-key-resolver.js';
import { loadConfig, loadInjectedSecrets } from '../../src/config/env.js';

describe('EnvSecretStore', () => {
  it('resolves logical and prefixed secret names from env injection', async () => {
    const store = new EnvSecretStore({
      DATABASE_URL: 'postgresql://local/db',
    });

    assert.equal(
      await store.getSecret('mi-iptv/dev/database_url'),
      'postgresql://local/db',
    );
    assert.equal(
      await store.getSecret('database_url'),
      'postgresql://local/db',
    );
    assert.equal(await store.getSecret('unknown'), undefined);
  });
});

describe('StaticKmsKeyResolver', () => {
  it('returns distinct mock keys per environment', () => {
    const resolver = new StaticKmsKeyResolver({});
    const dev = resolver.resolveKeyId('dev');
    const qa = resolver.resolveKeyId('qa');
    const prod = resolver.resolveKeyId('prod');
    assert.notEqual(dev, qa);
    assert.notEqual(qa, prod);
    assert.match(dev, /mock-dev/);
  });

  it('allows KMS_KEY_ID override', () => {
    const resolver = new StaticKmsKeyResolver({
      KMS_KEY_ID: 'arn:aws:kms:us-east-1:000000000001:key/override',
    });
    assert.equal(
      resolver.resolveKeyId('prod'),
      'arn:aws:kms:us-east-1:000000000001:key/override',
    );
  });
});

describe('loadConfig / loadInjectedSecrets', () => {
  it('loads APP_ENV and per-env kms key', () => {
    const config = loadConfig(
      { APP_ENV: 'qa', PORT: '4000' },
      new StaticKmsKeyResolver({}),
    );
    assert.equal(config.appEnv, 'qa');
    assert.equal(config.port, 4000);
    assert.match(config.kmsKeyId, /mock-qa/);
  });

  it('loads secrets through SecretStore without requiring AWS SDK', async () => {
    const store = new EnvSecretStore({
      DATABASE_URL: 'postgresql://qa/db',
      REDIS_URL: 'redis://qa',
    });
    const secrets = await loadInjectedSecrets('qa', store);
    assert.equal(secrets.databaseUrl, 'postgresql://qa/db');
    assert.equal(secrets.redisUrl, 'redis://qa');
    assert.equal(secrets.jwtPrivateKey, undefined);
  });
});
