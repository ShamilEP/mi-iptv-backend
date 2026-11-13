import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SetFavorite } from '../../src/application/sync/set-favorite.js';
import { UpsertPlaybackState } from '../../src/application/sync/upsert-playback-state.js';
import {
  buildSyncConflictReport,
  shouldReportSyncConflict,
} from '../../src/domain/sync/sync-log.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { InMemorySyncLogRepository } from '../../src/infrastructure/persistence/in-memory-sync-log-repository.js';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deviceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const contentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const itemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const eventPlayback = '11111111-1111-4111-8111-111111111111';
const eventFavorite = '22222222-2222-4222-8222-222222222222';

describe('SyncLog conflict notice helpers (BE-065)', () => {
  it('reports Sync Conflict for non-accepted resolvedBy values', () => {
    assert.equal(shouldReportSyncConflict('accepted'), false);
    assert.equal(shouldReportSyncConflict('lww'), true);
    assert.equal(shouldReportSyncConflict('max_position'), true);
    assert.equal(shouldReportSyncConflict('force_reset'), true);

    assert.equal(
      buildSyncConflictReport('playback_state', 'upsert', 'accepted'),
      null,
    );
    assert.deepEqual(
      buildSyncConflictReport('favorite', 'delete', 'lww'),
      {
        resolved: true,
        notice: 'Sync Conflict',
        entity: 'favorite',
        operation: 'delete',
        resolvedBy: 'lww',
      },
    );
  });
});

describe('shared SyncLog ledger (BE-065)', () => {
  it('persists entity, operation, resolvedBy for playback and favorites', async () => {
    const syncLog = new InMemorySyncLogRepository();
    const playback = new UpsertPlaybackState(
      new InMemoryPlaybackSyncRepository(syncLog),
    );
    const favorites = new SetFavorite(
      new InMemoryFavoriteSyncRepository(syncLog),
    );

    await playback.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId: eventPlayback,
      contentId,
      position: 10,
      completed: false,
      syncVersion: 0,
    });
    await favorites.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId: eventFavorite,
      itemId,
      action: 'add',
      syncVersion: 0,
    });

    const playbackLog = await syncLog.findByClientEventId(
      accountId,
      eventPlayback,
    );
    const favoriteLog = await syncLog.findByClientEventId(
      accountId,
      eventFavorite,
    );

    assert.equal(playbackLog?.entity, 'playback_state');
    assert.equal(playbackLog?.operation, 'upsert');
    assert.equal(playbackLog?.resolvedBy, 'accepted');
    assert.equal(favoriteLog?.entity, 'favorite');
    assert.equal(favoriteLog?.operation, 'upsert');
    assert.equal(favoriteLog?.resolvedBy, 'accepted');
  });

  it('replays a shared clientEventId instead of writing a second SyncLog row', async () => {
    const syncLog = new InMemorySyncLogRepository();
    const favoriteRepo = new InMemoryFavoriteSyncRepository(syncLog);
    const playback = new UpsertPlaybackState(
      new InMemoryPlaybackSyncRepository(syncLog),
    );
    const favorites = new SetFavorite(favoriteRepo);

    const first = await playback.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId: eventPlayback,
      contentId,
      position: 1,
      completed: false,
      syncVersion: 0,
    });

    const replayed = await favorites.execute({
      accountId,
      profileId,
      deviceId,
      clientEventId: eventPlayback,
      itemId,
      action: 'add',
      syncVersion: 0,
    });

    assert.equal(replayed.accepted, first.accepted);
    assert.equal(replayed.resolvedBy, first.resolvedBy);
    assert.equal(replayed.conflict, first.conflict);
    assert.equal(await favoriteRepo.findFavorite(accountId, profileId, itemId), null);

    const only = await syncLog.findByClientEventId(accountId, eventPlayback);
    assert.equal(only?.entity, 'playback_state');
  });
});
