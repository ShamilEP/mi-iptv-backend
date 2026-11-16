import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { AcceptBatchedSyncEvents } from '../../src/application/sync/accept-batched-sync-events.js';
import { GetProfileSettings } from '../../src/application/sync/get-profile-settings.js';
import { ListFavorites } from '../../src/application/sync/list-favorites.js';
import { ListPlaybackHistory } from '../../src/application/sync/list-playback-history.js';
import { SetFavorite } from '../../src/application/sync/set-favorite.js';
import { UpsertPlaybackState } from '../../src/application/sync/upsert-playback-state.js';
import { UpsertProfileSettings } from '../../src/application/sync/upsert-profile-settings.js';
import { decideSettingsWrite } from '../../src/domain/sync/decide-settings-write.js';
import {
  filterSyncableSettings,
  mergeSettingsPayload,
  SYNCABLE_SETTING_KEYS,
} from '../../src/domain/sync/profile-settings.js';
import { resolveSettingsConflict } from '../../src/domain/sync/settings-conflict.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemorySettingsSyncRepository } from '../../src/infrastructure/persistence/in-memory-settings-sync-repository.js';
import { InMemorySyncLogRepository } from '../../src/infrastructure/persistence/in-memory-sync-log-repository.js';
import { createSyncRoutes } from '../../src/presentation/http/routes/sync-routes.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';
import { seedTestProfile } from './helpers/seed-test-profile.js';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deviceA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const deviceB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

async function buildApi() {
  const profiles = new InMemoryProfileRepository();
  await seedTestProfile(profiles, accountId, profileId);
  const syncLog = new InMemorySyncLogRepository();
  const settings = new InMemorySettingsSyncRepository(syncLog);
  const favorites = new InMemoryFavoriteSyncRepository(syncLog);
  const playback = new InMemoryPlaybackSyncRepository(syncLog);
  const upsert = new UpsertProfileSettings(settings, profiles);
  const get = new GetProfileSettings(settings, profiles);
  const upsertPlaybackState = new UpsertPlaybackState(playback, profiles);
  const setFavorite = new SetFavorite(favorites, profiles);
  return {
    profiles,
    settings,
    upsert,
    get,
    routes: createSyncRoutes({
      upsertPlaybackState,
      listPlaybackHistory: new ListPlaybackHistory(playback, profiles),
      listFavorites: new ListFavorites(favorites, profiles),
      setFavorite,
      getProfileSettings: get,
      upsertProfileSettings: upsert,
      acceptBatchedSyncEvents: new AcceptBatchedSyncEvents(
        upsertPlaybackState,
        setFavorite,
        upsert,
      ),
    }),
  };
}

describe('BE-106 settings sync domain', () => {
  it('filters to syncable keys and merges field-level patches', () => {
    assert.ok(SYNCABLE_SETTING_KEYS.includes('autoplay'));
    assert.deepEqual(
      filterSyncableSettings({
        autoplay: false,
        language: 'en',
        volumeLocal: 9,
      }),
      { autoplay: false, language: 'en' },
    );
    assert.deepEqual(
      mergeSettingsPayload(
        { autoplay: true, language: 'es', subtitlePrefs: { lang: 'es' } },
        { language: 'en', historyEnabled: false },
      ),
      {
        autoplay: true,
        language: 'en',
        subtitlePrefs: { lang: 'es' },
        historyEnabled: false,
      },
    );
  });

  it('uses favorites-style LWW conflict rules', () => {
    const create = resolveSettingsConflict(null, { baseVersion: 0 });
    assert.equal(create.accepted, true);
    assert.equal(create.resolvedBy, 'accepted');
    assert.equal(create.resultVersion, 1);

    const match = resolveSettingsConflict(
      { syncVersion: 2 },
      { baseVersion: 2 },
    );
    assert.equal(match.resolvedBy, 'accepted');
    assert.equal(match.resultVersion, 3);

    const concurrent = resolveSettingsConflict(
      { syncVersion: 2 },
      { baseVersion: 1 },
    );
    assert.equal(concurrent.accepted, true);
    assert.equal(concurrent.resolvedBy, 'lww');
    assert.equal(concurrent.resultVersion, 3);
  });

  it('replays duplicate clientEventId without re-applying', () => {
    const decision = decideSettingsWrite({
      clientEventId: '11111111-1111-4111-8111-111111111111',
      priorEvent: {
        entity: 'setting',
        operation: 'upsert',
        accepted: true,
        resolvedBy: 'lww',
        resultVersion: 4,
        changeSeq: 9,
      },
      existing: { syncVersion: 4 },
      write: { baseVersion: 0 },
    });
    assert.equal(decision.isReplay, true);
    assert.equal(decision.resultVersion, 4);
    assert.equal(decision.resolvedBy, 'lww');
  });
});

describe('BE-106 settings sync use cases', () => {
  it('registers catalog routes', () => {
    const ops = new Set(ROUTE_CATALOG.map((e) => `${e.method} ${e.path}`));
    assert.ok(ops.has('GET /api/v1/sync/settings'));
    assert.ok(ops.has('POST /api/v1/sync/settings'));
  });

  it('upserts syncable fields, strips local-only keys, and LWW-merges', async () => {
    const api = await buildApi();
    const first = await api.upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId: randomUUID(),
      syncVersion: 0,
      payload: {
        autoplay: false,
        language: 'es',
        volumeLocal: 11,
      },
    });
    assert.equal(first.accepted, true);
    assert.equal(first.currentVersion, 1);
    assert.equal(first.settings.payload.autoplay, false);
    assert.equal(first.settings.payload.language, 'es');
    assert.equal(
      Object.prototype.hasOwnProperty.call(first.settings.payload, 'volumeLocal'),
      false,
    );

    const concurrent = await api.upsert.execute({
      accountId,
      profileId,
      deviceId: deviceB,
      clientEventId: randomUUID(),
      syncVersion: 0,
      payload: { language: 'en', historyEnabled: false },
    });
    assert.equal(concurrent.resolvedBy, 'lww');
    assert.equal(concurrent.currentVersion, 2);
    assert.equal(concurrent.settings.payload.autoplay, false);
    assert.equal(concurrent.settings.payload.language, 'en');
    assert.equal(concurrent.settings.payload.historyEnabled, false);
    assert.ok(concurrent.conflict);

    const listed = await api.get.execute(accountId, profileId);
    assert.equal(listed.syncVersion, 2);
    assert.equal(listed.payload.language, 'en');
  });

  it('is idempotent on clientEventId', async () => {
    const api = await buildApi();
    const clientEventId = randomUUID();
    const first = await api.upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId,
      syncVersion: 0,
      payload: { autoplay: true },
    });
    const replay = await api.upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId,
      syncVersion: 0,
      payload: { autoplay: false },
    });
    assert.equal(replay.currentVersion, first.currentVersion);
    assert.equal(replay.settings.payload.autoplay, true);
  });

  it('accepts setting events in offline batches and HTTP', async () => {
    const api = await buildApi();
    const route = api.routes.find(
      (r) => r.method === 'POST' && r.path === '/api/v1/sync/settings',
    );
    assert.ok(route);
    const response = await route.handler({
      method: 'POST',
      url: '/api/v1/sync/settings',
      headers: {
        'x-account-id': accountId,
        'x-profile-id': profileId,
        'x-device-id': deviceA,
      },
      accountId,
      body: {
        clientEventId: randomUUID(),
        syncVersion: 0,
        payload: { subtitlePrefs: { lang: 'en' } },
      },
    });
    assert.equal(response.statusCode, 200);

    const batchRoute = api.routes.find(
      (r) => r.method === 'POST' && r.path === '/api/v1/sync/events',
    );
    assert.ok(batchRoute);
    const batch = await batchRoute.handler({
      method: 'POST',
      url: '/api/v1/sync/events',
      headers: {
        'x-account-id': accountId,
        'x-profile-id': profileId,
        'x-device-id': deviceA,
      },
      accountId,
      body: {
        events: [
          {
            entity: 'setting',
            clientEventId: randomUUID(),
            syncVersion: 1,
            payload: { autoplay: true },
          },
        ],
      },
    });
    assert.equal(batch.statusCode, 200);
    const body = batch.body as {
      results: Array<{ entity: string; accepted: boolean }>;
    };
    assert.equal(body.results[0]?.entity, 'setting');
    assert.equal(body.results[0]?.accepted, true);
  });
});
