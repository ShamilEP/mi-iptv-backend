import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { CreateSource } from '../../src/application/sources/create-source.js';
import { createAllowingValidateSourceUrl } from '../helpers/source-use-cases.js';
import { DeleteSource } from '../../src/application/sources/delete-source.js';
import { GetSyncState } from '../../src/application/sync/get-sync-state.js';
import { parseSyncStateQuery } from '../../src/application/sync/parse-sync-state-query.js';
import { SetFavorite } from '../../src/application/sync/set-favorite.js';
import { UpsertPlaybackState } from '../../src/application/sync/upsert-playback-state.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { InMemoryAccountSyncClock } from '../../src/infrastructure/persistence/in-memory-account-sync-clock.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';
import { InMemorySyncLogRepository } from '../../src/infrastructure/persistence/in-memory-sync-log-repository.js';
import { createSyncRoutes } from '../../src/presentation/http/routes/sync-routes.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';
import { AcceptBatchedSyncEvents } from '../../src/application/sync/accept-batched-sync-events.js';
import { GetProfileSettings } from '../../src/application/sync/get-profile-settings.js';
import { ListFavorites } from '../../src/application/sync/list-favorites.js';
import { ListPlaybackHistory } from '../../src/application/sync/list-playback-history.js';
import { UpsertProfileSettings } from '../../src/application/sync/upsert-profile-settings.js';
import { InMemorySettingsSyncRepository } from '../../src/infrastructure/persistence/in-memory-settings-sync-repository.js';
import { randomBytes } from 'node:crypto';
import { seedTestProfile } from './helpers/seed-test-profile.js';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deviceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function buildStack() {
  const clock = new InMemoryAccountSyncClock();
  const syncLog = new InMemorySyncLogRepository();
  const profiles = new InMemoryProfileRepository();
  await seedTestProfile(profiles, accountId, profileId);
  const playback = new InMemoryPlaybackSyncRepository(syncLog, clock);
  const favorites = new InMemoryFavoriteSyncRepository(syncLog, clock);
  const sources = new InMemorySourceRepository();
  const cipher = new Aes256GcmSourceCredentialCipher(
    randomBytes(32),
    'key-dev',
  );
  const createSource = new CreateSource(
    sources,
    cipher,
    clock,
    createAllowingValidateSourceUrl(),
  );
  const deleteSource = new DeleteSource(sources, clock);
  const upsertPlayback = new UpsertPlaybackState(playback, profiles);
  const setFavorite = new SetFavorite(favorites, profiles);
  const getSyncState = new GetSyncState(clock, playback, favorites, sources);
  return {
    clock,
    createSource,
    deleteSource,
    upsertPlayback,
    setFavorite,
    getSyncState,
    sources,
  };
}

describe('BE-062 GET /sync/state', () => {
  it('parses cursor/limit and rejects wall-clock since timestamps', () => {
    assert.deepEqual(parseSyncStateQuery({}), { cursor: 0, limit: 500 });
    assert.deepEqual(parseSyncStateQuery({ since: '3', limit: '2' }), {
      cursor: 3,
      limit: 2,
    });
    assert.throws(
      () => parseSyncStateQuery({ since: '2026-01-01T00:00:00.000Z' }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'SYNC_CURSOR_INVALID',
    );
  });

  it('returns playback, favorite, and source deltas with tombstones and pagination', async () => {
    const api = await buildStack();
    await api.upsertPlayback.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId: randomUUID(),
      contentId: 'content-1',
      position: 10,
      duration: 100,
      completed: false,
      sourceId: null,
      syncVersion: 0,
      forceReset: false,
      clientReportedAt: null,
    });
    await api.setFavorite.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId: randomUUID(),
      itemId: 'item-1',
      action: 'add',
      type: 'vod',
      sortOrder: 1,
      syncVersion: 0,
      clientReportedAt: null,
    });
    const source = await api.createSource.execute({
      accountId,
      kind: 'm3u',
      name: 'List',
      uriRef: 'https://cdn.example/list.m3u',
    });
    await api.deleteSource.execute(accountId, source.id);
    await api.setFavorite.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId: randomUUID(),
      itemId: 'item-1',
      action: 'remove',
      type: 'vod',
      sortOrder: 1,
      syncVersion: 1,
      clientReportedAt: null,
    });

    const page1 = await api.getSyncState.execute({
      accountId,
      cursor: 0,
      limit: 2,
    });
    assert.equal(page1.changes.length, 2);
    assert.equal(page1.truncated, true);
    assert.equal(page1.nextCursor, page1.changes[1]!.seq);
    assert.ok(page1.serverTimestamp.includes('T'));

    const page2 = await api.getSyncState.execute({
      accountId,
      cursor: page1.nextCursor,
      limit: 10,
    });
    assert.equal(page2.truncated, false);
    const entities = [...page1.changes, ...page2.changes].map((c) => c.entity);
    assert.ok(entities.includes('playback_state'));
    assert.ok(entities.includes('favorite'));
    assert.ok(entities.includes('source'));

    const sourceDelta = [...page1.changes, ...page2.changes].find(
      (c) => c.entity === 'source',
    );
    assert.ok(sourceDelta);
    assert.equal(sourceDelta.deleted, true);
    assert.equal(
      (sourceDelta.payload as { credentialsEncrypted?: unknown })
        .credentialsEncrypted,
      undefined,
    );
    assert.equal(
      (sourceDelta.payload as { password?: unknown }).password,
      undefined,
    );

    const favoriteTombstone = [...page1.changes, ...page2.changes]
      .filter((c) => c.entity === 'favorite')
      .at(-1);
    assert.ok(favoriteTombstone);
    assert.equal(favoriteTombstone.deleted, true);
  });

  it('returns 409 when cursor is behind the tombstone floor', async () => {
    const api = await buildStack();
    await api.clock.raiseTombstoneFloor(accountId, 5);
    await assert.rejects(
      () => api.getSyncState.execute({ accountId, cursor: 2 }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'SYNC_FULL_RESYNC_REQUIRED',
    );

    const settings = new InMemorySettingsSyncRepository();
    const profiles = new InMemoryProfileRepository();
    await seedTestProfile(profiles, accountId, profileId);
    const playback = new InMemoryPlaybackSyncRepository();
    const favorites = new InMemoryFavoriteSyncRepository();
    const routes = createSyncRoutes({
      upsertPlaybackState: new UpsertPlaybackState(playback, profiles),
      listPlaybackHistory: new ListPlaybackHistory(playback, profiles),
      listFavorites: new ListFavorites(favorites, profiles),
      setFavorite: new SetFavorite(favorites, profiles),
      getProfileSettings: new GetProfileSettings(settings, profiles),
      upsertProfileSettings: new UpsertProfileSettings(settings, profiles),
      acceptBatchedSyncEvents: new AcceptBatchedSyncEvents(
        new UpsertPlaybackState(playback, profiles),
        new SetFavorite(favorites, profiles),
        new UpsertProfileSettings(settings, profiles),
      ),
      getSyncState: api.getSyncState,
      syncClock: api.clock,
    });
    const route = routes.find(
      (entry) =>
        entry.method === 'GET' && entry.path === '/api/v1/sync/state',
    );
    assert.ok(route);
    const response = await route.handler({
      method: 'GET',
      url: '/api/v1/sync/state',
      query: { cursor: '1' },
      headers: { 'x-account-id': accountId },
      accountId,
    });
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body, {
      code: 'SYNC_FULL_RESYNC_REQUIRED',
      tombstoneFloor: 5,
      message: 'Cursor is behind the tombstone floor — full resync required',
    });
  });

  it('registers getSyncState in the route catalog', () => {
    const entry = ROUTE_CATALOG.find(
      (route) =>
        route.method === 'GET' && route.path === '/api/v1/sync/state',
    );
    assert.ok(entry);
    assert.equal(entry.operationId, 'getSyncState');
  });
});
