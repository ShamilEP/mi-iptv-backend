import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { ListFavorites } from '../../src/application/sync/list-favorites.js';
import { SetFavorite } from '../../src/application/sync/set-favorite.js';
import { UpsertPlaybackState } from '../../src/application/sync/upsert-playback-state.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { createSyncRoutes } from '../../src/presentation/http/routes/sync-routes.js';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profileA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const profileB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const deviceId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const item1 = '11111111-1111-4111-8111-111111111111';
const item2 = '22222222-2222-4222-8222-222222222222';
const event1 = '33333333-3333-4333-8333-333333333333';
const event2 = '44444444-4444-4444-8444-444444444444';
const event3 = '55555555-5555-4555-8555-555555555555';

function buildApi() {
  const repository = new InMemoryFavoriteSyncRepository();
  return {
    repository,
    list: new ListFavorites(repository),
    set: new SetFavorite(repository),
  };
}

describe('SetFavorite / ListFavorites (BE-063)', () => {
  it('adds with sortOrder and lists per profile only', async () => {
    const api = buildApi();
    const added = await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event1,
      itemId: item1,
      action: 'add',
      syncVersion: 0,
      type: 'channel',
      sortOrder: 10,
    });
    assert.equal(added.accepted, true);
    assert.equal(added.currentVersion, 1);
    assert.equal(added.resolvedBy, 'accepted');

    await api.set.execute({
      accountId,
      profileId: profileB,
      deviceId,
      clientEventId: event2,
      itemId: item2,
      action: 'add',
      syncVersion: 0,
      type: 'vod',
      sortOrder: 1,
    });

    const forA = await api.list.execute(accountId, profileA);
    assert.equal(forA.length, 1);
    assert.equal(forA[0]?.itemId, item1);
    assert.equal(forA[0]?.type, 'channel');
    assert.equal(forA[0]?.sortOrder, 10);

    const forB = await api.list.execute(accountId, profileB);
    assert.equal(forB.length, 1);
    assert.equal(forB[0]?.itemId, item2);
  });

  it('is idempotent for the same clientEventId', async () => {
    const api = buildApi();
    const first = await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event1,
      itemId: item1,
      action: 'add',
      syncVersion: 0,
      sortOrder: 5,
    });
    const second = await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event1,
      itemId: item1,
      action: 'remove',
      syncVersion: 0,
    });
    assert.equal(second.accepted, first.accepted);
    assert.equal(second.currentVersion, first.currentVersion);
    assert.equal(second.resolvedBy, first.resolvedBy);

    const listed = await api.list.execute(accountId, profileA);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.sortOrder, 5);
  });

  it('removes via tombstone and excludes from GET', async () => {
    const api = buildApi();
    await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event1,
      itemId: item1,
      action: 'add',
      syncVersion: 0,
    });
    const removed = await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event2,
      itemId: item1,
      action: 'remove',
      syncVersion: 1,
    });
    assert.equal(removed.accepted, true);
    assert.equal(removed.currentVersion, 2);
    assert.equal((await api.list.execute(accountId, profileA)).length, 0);

    const revived = await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event3,
      itemId: item1,
      action: 'add',
      syncVersion: 2,
      type: 'vod',
    });
    assert.equal(revived.currentVersion, 3);
    assert.equal((await api.list.execute(accountId, profileA)).length, 1);
  });

  it('marks concurrent base mismatch as lww and preserves/overrides sortOrder', async () => {
    const api = buildApi();
    await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event1,
      itemId: item1,
      action: 'add',
      syncVersion: 0,
      sortOrder: 1,
    });
    const concurrent = await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event2,
      itemId: item1,
      action: 'add',
      syncVersion: 0,
      sortOrder: 99,
    });
    assert.equal(concurrent.resolvedBy, 'lww');
    assert.equal(concurrent.accepted, true);
    assert.deepEqual(concurrent.conflict, {
      resolved: true,
      notice: 'Sync Conflict',
      entity: 'favorite',
      operation: 'upsert',
      resolvedBy: 'lww',
    });
    const listed = await api.list.execute(accountId, profileA);
    assert.equal(listed[0]?.sortOrder, 99);

    const log = await api.repository.findSyncEvent(accountId, event2);
    assert.equal(log?.entity, 'favorite');
    assert.equal(log?.operation, 'upsert');
    assert.equal(log?.resolvedBy, 'lww');
  });

  it('orders GET results by sortOrder then createdAt', async () => {
    const api = buildApi();
    await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event1,
      itemId: item2,
      action: 'add',
      syncVersion: 0,
      sortOrder: 20,
    });
    await api.set.execute({
      accountId,
      profileId: profileA,
      deviceId,
      clientEventId: event2,
      itemId: item1,
      action: 'add',
      syncVersion: 0,
      sortOrder: 10,
    });
    const listed = await api.list.execute(accountId, profileA);
    assert.deepEqual(
      listed.map((row) => row.itemId),
      [item1, item2],
    );
  });

  it('rejects invalid action and type', async () => {
    const api = buildApi();
    await assert.rejects(
      () =>
        api.set.execute({
          accountId,
          profileId: profileA,
          deviceId,
          clientEventId: event1,
          itemId: item1,
          action: 'toggle',
          syncVersion: 0,
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'FAVORITE_ACTION_INVALID',
    );
    await assert.rejects(
      () =>
        api.set.execute({
          accountId,
          profileId: profileA,
          deviceId,
          clientEventId: event2,
          itemId: item1,
          action: 'add',
          syncVersion: 0,
          type: 'movie',
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'FAVORITE_TYPE_INVALID',
    );
  });
});

describe('GET/POST /api/v1/sync/favorites routes (BE-063)', () => {
  it('wires list and set through HTTP adapters', async () => {
    const api = buildApi();
    const routes = createSyncRoutes({
      upsertPlaybackState: new UpsertPlaybackState(
        new InMemoryPlaybackSyncRepository(),
      ),
      listFavorites: api.list,
      setFavorite: api.set,
    });
    const listRoute = routes.find(
      (route) => route.method === 'GET' && route.path === '/api/v1/sync/favorites',
    );
    const setRoute = routes.find(
      (route) =>
        route.method === 'POST' && route.path === '/api/v1/sync/favorites',
    );
    assert.ok(listRoute);
    assert.ok(setRoute);

    const write = await setRoute.handler({
      method: 'POST',
      url: '/api/v1/sync/favorites',
      headers: {
        'x-account-id': accountId,
        'x-profile-id': profileA,
        'x-device-id': deviceId,
      },
      accountId,
      body: {
        clientEventId: event1,
        itemId: item1,
        action: 'add',
        syncVersion: 0,
        type: 'channel',
        sortOrder: 3,
      },
    });
    assert.equal(write.statusCode, 200);
    const writeBody = write.body as Record<string, unknown>;
    assert.equal(writeBody.accepted, true);
    assert.equal(writeBody.currentVersion, 1);

    const list = await listRoute.handler({
      method: 'GET',
      url: '/api/v1/sync/favorites',
      headers: {
        'x-account-id': accountId,
        'x-profile-id': profileA,
      },
      accountId,
    });
    assert.equal(list.statusCode, 200);
    const listBody = list.body as { items: Array<{ itemId: string }> };
    assert.equal(listBody.items.length, 1);
    assert.equal(listBody.items[0]?.itemId, item1);
  });
});
