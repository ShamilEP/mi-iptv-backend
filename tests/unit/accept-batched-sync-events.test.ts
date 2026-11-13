import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AcceptBatchedSyncEvents } from '../../src/application/sync/accept-batched-sync-events.js';
import { ListFavorites } from '../../src/application/sync/list-favorites.js';
import { SetFavorite } from '../../src/application/sync/set-favorite.js';
import { UpsertPlaybackState } from '../../src/application/sync/upsert-playback-state.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { SYNC_BATCH_MAX_EVENTS } from '../../src/domain/sync/sync-batch.js';
import { ListPlaybackHistory } from '../../src/application/sync/list-playback-history.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemorySyncLogRepository } from '../../src/infrastructure/persistence/in-memory-sync-log-repository.js';
import { createSyncRoutes } from '../../src/presentation/http/routes/sync-routes.js';
import { seedTestProfile } from './helpers/seed-test-profile.js';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deviceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const contentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const itemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const eventPlayback = '11111111-1111-4111-8111-111111111111';
const eventFavorite = '22222222-2222-4222-8222-222222222222';
const eventReplay = '33333333-3333-4333-8333-333333333333';

async function buildStack() {
  const profiles = new InMemoryProfileRepository();
  await seedTestProfile(profiles, accountId, profileId);
  const syncLog = new InMemorySyncLogRepository();
  const playbackRepo = new InMemoryPlaybackSyncRepository(syncLog);
  const favoriteRepo = new InMemoryFavoriteSyncRepository(syncLog);
  const upsertPlaybackState = new UpsertPlaybackState(playbackRepo, profiles);
  const setFavorite = new SetFavorite(favoriteRepo, profiles);
  const listFavorites = new ListFavorites(favoriteRepo, profiles);
  const listPlaybackHistory = new ListPlaybackHistory(playbackRepo, profiles);
  const acceptBatchedSyncEvents = new AcceptBatchedSyncEvents(
    upsertPlaybackState,
    setFavorite,
  );
  return {
    upsertPlaybackState,
    setFavorite,
    listFavorites,
    listPlaybackHistory,
    acceptBatchedSyncEvents,
    favoriteRepo,
    profiles,
  };
}

describe('AcceptBatchedSyncEvents (BE-067)', () => {
  it('applies mixed playback and favorite events in order', async () => {
    const api = await buildStack();
    const result = await api.acceptBatchedSyncEvents.execute({
      accountId,
      profileId,
      deviceId,
      events: [
        {
          entity: 'playback_state',
          clientEventId: eventPlayback,
          contentId,
          position: 120,
          completed: false,
          syncVersion: 0,
        },
        {
          entity: 'favorite',
          clientEventId: eventFavorite,
          itemId,
          action: 'add',
          syncVersion: 0,
          type: 'vod',
          sortOrder: 2,
        },
      ],
    });

    assert.equal(result.status, 'OK');
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0]?.entity, 'playback_state');
    assert.equal(result.results[0]?.accepted, true);
    assert.equal(result.results[0]?.currentVersion, 1);
    assert.equal(result.results[1]?.entity, 'favorite');
    assert.equal(result.results[1]?.accepted, true);

    const favorites = await api.listFavorites.execute(accountId, profileId);
    assert.equal(favorites.length, 1);
    assert.equal(favorites[0]?.itemId, itemId);
  });

  it('is idempotent per clientEventId inside a batch replay', async () => {
    const api = await buildStack();
    const first = await api.acceptBatchedSyncEvents.execute({
      accountId,
      profileId,
      deviceId,
      events: [
        {
          entity: 'playback_state',
          clientEventId: eventReplay,
          contentId,
          position: 10,
          completed: false,
          syncVersion: 0,
        },
      ],
    });
    const second = await api.acceptBatchedSyncEvents.execute({
      accountId,
      profileId,
      deviceId,
      events: [
        {
          entity: 'playback_state',
          clientEventId: eventReplay,
          contentId,
          position: 999,
          completed: true,
          syncVersion: 0,
        },
      ],
    });

    assert.equal(second.results[0]?.accepted, first.results[0]?.accepted);
    assert.equal(
      second.results[0]?.currentVersion,
      first.results[0]?.currentVersion,
    );
    assert.equal(second.results[0]?.resolvedBy, first.results[0]?.resolvedBy);
  });

  it('rejects an empty events array', async () => {
    const api = await buildStack();
    await assert.rejects(
      () =>
        api.acceptBatchedSyncEvents.execute({
          accountId,
          profileId,
          deviceId,
          events: [],
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'SYNC_BATCH_INVALID',
    );
  });

  it('rejects batches over the size limit', async () => {
    const api = await buildStack();
    const events = Array.from({ length: SYNC_BATCH_MAX_EVENTS + 1 }, (_, i) => {
      const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
      return {
        entity: 'favorite' as const,
        clientEventId: id,
        itemId: id,
        action: 'add',
        syncVersion: 0,
      };
    });

    await assert.rejects(
      () =>
        api.acceptBatchedSyncEvents.execute({
          accountId,
          profileId,
          deviceId,
          events,
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'SYNC_BATCH_TOO_LARGE',
    );
  });
});

describe('POST /api/v1/sync/events route (BE-067)', () => {
  it('maps a batch body to per-event results', async () => {
    const api = await buildStack();
    const routes = createSyncRoutes(api);
    const route = routes.find(
      (entry) =>
        entry.method === 'POST' && entry.path === '/api/v1/sync/events',
    );
    assert.ok(route);

    const response = await route.handler({
      method: 'POST',
      url: '/api/v1/sync/events',
      headers: {
        'x-account-id': accountId,
        'x-profile-id': profileId,
        'x-device-id': deviceId,
      },
      accountId,
      body: {
        events: [
          {
            entity: 'playback_state',
            clientEventId: eventPlayback,
            contentId,
            position: 5,
            completed: false,
            syncVersion: 0,
          },
          {
            entity: 'favorite',
            clientEventId: eventFavorite,
            itemId,
            action: 'add',
            syncVersion: 0,
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.body as {
      status: string;
      results: Array<{ entity: string; accepted: boolean }>;
    };
    assert.equal(body.status, 'OK');
    assert.equal(body.results.length, 2);
    assert.equal(body.results[0]?.entity, 'playback_state');
    assert.equal(body.results[1]?.entity, 'favorite');
  });

  it('rejects oversized batches at the HTTP boundary', async () => {
    const api = await buildStack();
    const routes = createSyncRoutes(api);
    const route = routes.find(
      (entry) =>
        entry.method === 'POST' && entry.path === '/api/v1/sync/events',
    );
    assert.ok(route);

    const response = await route.handler({
      method: 'POST',
      url: '/api/v1/sync/events',
      headers: {
        'x-account-id': accountId,
        'x-profile-id': profileId,
        'x-device-id': deviceId,
      },
      accountId,
      body: {
        events: Array.from({ length: SYNC_BATCH_MAX_EVENTS + 1 }, () => ({
          entity: 'favorite',
          clientEventId: eventFavorite,
          itemId,
          action: 'add',
          syncVersion: 0,
        })),
      },
    });

    assert.equal(response.statusCode, 400);
    const body = response.body as { code: string };
    assert.equal(body.code, 'SYNC_BATCH_TOO_LARGE');
  });
});
