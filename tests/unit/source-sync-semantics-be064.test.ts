import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { DeleteSource } from '../../src/application/sources/delete-source.js';
import { GetSyncState } from '../../src/application/sync/get-sync-state.js';
import { toSourceDelta } from '../../src/application/sync/sync-delta-public-view.js';
import {
  assertSourceDeltaHasNoSecrets,
  assertSourceNotInSyncBatch,
} from '../../src/domain/sources/source-sync.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { InMemoryAccountSyncClock } from '../../src/infrastructure/persistence/in-memory-account-sync-clock.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';
import { createSyncRoutes } from '../../src/presentation/http/routes/sync-routes.js';
import {
  createAllowingValidateSourceUrl,
} from '../helpers/source-use-cases.js';
import { CreateSource } from '../../src/application/sources/create-source.js';
import { UpdateSource } from '../../src/application/sources/update-source.js';

const docPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/backend/064-source-sync-semantics.md',
);

const accountId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildStack() {
  const clock = new InMemoryAccountSyncClock();
  const sources = new InMemorySourceRepository();
  const cipher = new Aes256GcmSourceCredentialCipher(
    randomBytes(32),
    'be064-dek',
  );
  const validateSourceUrl = createAllowingValidateSourceUrl();
  const create = new CreateSource(sources, cipher, clock, validateSourceUrl);
  const update = new UpdateSource(sources, cipher, clock, validateSourceUrl);
  const remove = new DeleteSource(sources, clock);
  const getSyncState = new GetSyncState(
    clock,
    new InMemoryPlaybackSyncRepository(),
    new InMemoryFavoriteSyncRepository(),
    sources,
  );
  return { clock, sources, create, update, remove, getSyncState };
}

describe('BE-064 source sync semantics', () => {
  it('documents ADR-009 replication without secrets', () => {
    const doc = readFileSync(docPath, 'utf8');
    assert.match(doc, /ADR-009/);
    assert.match(doc, /change_seq/);
    assert.match(doc, /SOURCE_SYNC_BATCH_FORBIDDEN/);
  });

  it('replicates CRUD metadata to peers via /sync/state without credentials', async () => {
    const api = buildStack();

    const created = await api.create.execute({
      accountId,
      kind: 'xtream',
      name: 'Living Room',
      uriRef: 'https://iptv.example/player_api.php',
      credentials: { username: 'u', password: 'super-secret' },
    });
    assert.equal(created.password, null);
    assert.equal(created.credentialsConfigured, true);

    // Peer device pulls deltas after create.
    const afterCreate = await api.getSyncState.execute({
      accountId,
      cursor: 0,
      limit: 50,
    });
    const createDelta = afterCreate.changes.find((c) => c.entity === 'source');
    assert.ok(createDelta);
    assert.equal(createDelta.deleted, false);
    assert.equal((createDelta.payload as { name: string }).name, 'Living Room');
    assert.equal(
      (createDelta.payload as { credentialsEncrypted?: unknown })
        .credentialsEncrypted,
      undefined,
    );
    assert.equal(
      (createDelta.payload as { password?: unknown }).password,
      undefined,
    );
    assertSourceDeltaHasNoSecrets(
      createDelta.payload as Record<string, unknown>,
    );

    await api.update.execute({
      accountId,
      sourceId: created.id,
      name: 'Bedroom',
      priority: 10,
    });
    await api.remove.execute(accountId, created.id);

    const afterDelete = await api.getSyncState.execute({
      accountId,
      cursor: createDelta.seq,
      limit: 50,
    });
    const entities = afterDelete.changes.map((c) => c.entity);
    assert.ok(entities.includes('source'));
    const tombstone = afterDelete.changes.find(
      (c) => c.entity === 'source' && c.deleted,
    );
    assert.ok(tombstone);
    assert.equal((tombstone.payload as { name: string }).name, 'Bedroom');

    const stored = await api.sources.findById(accountId, created.id);
    assert.ok(stored);
    assert.equal(stored.credentialsEncrypted, null);
    assert.equal(stored.encKeyId, null);
  });

  it('rejects source entities on /sync/events (mutations stay on CRUD)', async () => {
    assert.throws(
      () => assertSourceNotInSyncBatch('source'),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'SOURCE_SYNC_BATCH_FORBIDDEN',
    );

    const routes = createSyncRoutes({
      upsertPlaybackState: { execute: async () => ({}) } as never,
      listPlaybackHistory: { execute: async () => [] } as never,
      listFavorites: { execute: async () => [] } as never,
      setFavorite: { execute: async () => ({}) } as never,
      getProfileSettings: { execute: async () => ({}) } as never,
      upsertProfileSettings: { execute: async () => ({}) } as never,
      acceptBatchedSyncEvents: { execute: async () => ({}) } as never,
      getSyncState: { execute: async () => ({}) } as never,
      syncClock: new InMemoryAccountSyncClock(),
    });
    const route = routes.find(
      (entry) =>
        entry.method === 'POST' && entry.path === '/api/v1/sync/events',
    );
    assert.ok(route);

    const response = await route!.handler({
      method: 'POST',
      url: '/api/v1/sync/events',
      headers: {
        'x-profile-id': randomUUID(),
        'x-device-id': randomUUID(),
      },
      accountId,
      body: {
        events: [
          {
            entity: 'source',
            clientEventId: randomUUID(),
            syncVersion: 0,
          },
        ],
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(
      (response.body as { code: string }).code,
      'SOURCE_SYNC_BATCH_FORBIDDEN',
    );
  });

  it('fails closed if a source delta projection carried secrets', () => {
    assert.throws(
      () =>
        assertSourceDeltaHasNoSecrets({
          id: 'x',
          password: 'leak',
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'SOURCE_SYNC_SECRET_LEAK',
    );

    const row = {
      id: randomUUID(),
      accountId,
      kind: 'm3u' as const,
      name: 'Safe',
      uriRef: 'https://example.com/a.m3u',
      credentialsEncrypted: new Uint8Array([1, 2, 3]),
      encKeyId: 'k',
      priority: 1,
      enabled: true,
      status: 'ok' as const,
      statusReason: null,
      itemCount: 1,
      lastIngestedAt: null,
      syncVersion: 1,
      changeSeq: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const delta = toSourceDelta(row);
    assert.equal(
      (delta.payload as { credentialsEncrypted?: unknown })
        .credentialsEncrypted,
      undefined,
    );
  });
});
