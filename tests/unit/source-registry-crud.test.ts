import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { CreateSource } from '../../src/application/sources/create-source.js';
import { DeleteSource } from '../../src/application/sources/delete-source.js';
import { ListSources } from '../../src/application/sources/list-sources.js';
import { UpdateSource } from '../../src/application/sources/update-source.js';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';

const accountId = '11111111-1111-1111-1111-111111111111';

function buildUseCases() {
  const repo = new InMemorySourceRepository();
  const cipher = new Aes256GcmSourceCredentialCipher(
    randomBytes(32),
    'arn:aws:kms:us-east-1:000000000001:key/mock-dev-source-creds',
  );
  return {
    create: new CreateSource(repo, cipher),
    list: new ListSources(repo),
    update: new UpdateSource(repo, cipher),
    remove: new DeleteSource(repo),
  };
}

describe('Source registry CRUD (BE-040)', () => {
  it('creates, lists, prioritizes, deactivates, and deletes with masked secrets', async () => {
    const api = buildUseCases();
    const created = await api.create.execute({
      accountId,
      kind: 'xtream',
      name: 'Home Xtream',
      uriRef: 'https://example.invalid:8080',
      credentials: { username: 'u1', password: 'p-secret' },
      priority: 50,
    });

    assert.equal(created.password, null);
    assert.equal(created.username, null);
    assert.equal(created.credentialsConfigured, true);
    assert.equal(created.priority, 50);

    const listed = await api.list.execute(accountId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.password, null);

    const updated = await api.update.execute({
      accountId,
      sourceId: created.id,
      priority: 10,
      enabled: false,
      name: 'Home Xtream (paused)',
    });
    assert.equal(updated.priority, 10);
    assert.equal(updated.enabled, false);
    assert.equal(updated.name, 'Home Xtream (paused)');
    assert.equal(updated.password, null);

    await api.remove.execute(accountId, created.id);
    assert.equal((await api.list.execute(accountId)).length, 0);
  });

  it('rejects create without xtream credentials', async () => {
    const api = buildUseCases();
    await assert.rejects(
      () =>
        api.create.execute({
          accountId,
          kind: 'xtream',
          name: 'No creds',
          uriRef: 'https://example.invalid',
        }),
      /credentials/i,
    );
  });

  it('creates M3U sources without credentials', async () => {
    const api = buildUseCases();
    const created = await api.create.execute({
      accountId,
      kind: 'm3u',
      name: 'Public M3U',
      uriRef: 'https://example.invalid/playlist.m3u',
    });
    assert.equal(created.kind, 'm3u');
    assert.equal(created.credentialsConfigured, false);
    assert.equal(created.password, null);
  });
});
