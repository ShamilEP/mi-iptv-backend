import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UpsertPlaybackState } from '../../src/application/sync/upsert-playback-state.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { createSyncRoutes } from '../../src/presentation/http/routes/sync-routes.js';
import { SyncError } from '../../src/domain/sync/sync-error.js';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deviceA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const deviceB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const contentId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const event1 = '11111111-1111-4111-8111-111111111111';
const event2 = '22222222-2222-4222-8222-222222222222';
const event3 = '33333333-3333-4333-8333-333333333333';

function buildUseCase() {
  const repository = new InMemoryPlaybackSyncRepository();
  return {
    repository,
    upsert: new UpsertPlaybackState(repository),
  };
}

describe('UpsertPlaybackState (BE-061)', () => {
  it('accepts a first write and returns accepted, currentVersion, serverTimestamp', async () => {
    const { upsert } = buildUseCase();
    const result = await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId: event1,
      contentId,
      position: 120,
      completed: false,
      syncVersion: 0,
      duration: 3600,
    });

    assert.equal(result.status, 'OK');
    assert.equal(result.accepted, true);
    assert.equal(result.currentVersion, 1);
    assert.equal(result.resolvedBy, 'accepted');
    assert.ok(result.serverTimestamp instanceof Date);
    assert.equal(result.changeSeq, 1);
  });

  it('is idempotent for the same clientEventId', async () => {
    const { upsert, repository } = buildUseCase();
    const first = await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId: event1,
      contentId,
      position: 50,
      completed: false,
      syncVersion: 0,
    });
    const second = await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId: event1,
      contentId,
      position: 999,
      completed: true,
      syncVersion: 0,
      forceReset: true,
    });

    assert.equal(second.accepted, first.accepted);
    assert.equal(second.currentVersion, first.currentVersion);
    assert.equal(second.resolvedBy, first.resolvedBy);
    const stored = await repository.findPlaybackState(
      accountId,
      profileId,
      contentId,
    );
    assert.equal(stored?.positionSec, 50);
    assert.equal(stored?.completed, false);
  });

  it('keeps the greater position within a 60s multi-device window', async () => {
    const { upsert, repository } = buildUseCase();
    const base = await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId: event1,
      contentId,
      position: 800,
      completed: false,
      syncVersion: 0,
    });
    assert.equal(base.currentVersion, 1);

    const rejected = await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceB,
      clientEventId: event2,
      contentId,
      position: 700,
      completed: false,
      syncVersion: 0,
    });
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.resolvedBy, 'max_position');
    assert.equal(rejected.currentVersion, 1);
    assert.equal(rejected.changeSeq, null);

    const kept = await repository.findPlaybackState(
      accountId,
      profileId,
      contentId,
    );
    assert.equal(kept?.positionSec, 800);
  });

  it('accepts forceReset over a lower position in the conflict window', async () => {
    const { upsert, repository } = buildUseCase();
    await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId: event1,
      contentId,
      position: 800,
      completed: false,
      syncVersion: 0,
    });

    const reset = await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceB,
      clientEventId: event2,
      contentId,
      position: 10,
      completed: false,
      syncVersion: 0,
      forceReset: true,
    });

    assert.equal(reset.accepted, true);
    assert.equal(reset.resolvedBy, 'force_reset');
    assert.equal(reset.currentVersion, 2);
    const stored = await repository.findPlaybackState(
      accountId,
      profileId,
      contentId,
    );
    assert.equal(stored?.positionSec, 10);
  });

  it('accepts optimistic same-version rewrites including rewinds', async () => {
    const { upsert, repository } = buildUseCase();
    await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId: event1,
      contentId,
      position: 500,
      completed: false,
      syncVersion: 0,
    });
    const rewind = await upsert.execute({
      accountId,
      profileId,
      deviceId: deviceA,
      clientEventId: event3,
      contentId,
      position: 20,
      completed: false,
      syncVersion: 1,
    });
    assert.equal(rewind.accepted, true);
    assert.equal(rewind.resolvedBy, 'accepted');
    assert.equal(rewind.currentVersion, 2);
    const stored = await repository.findPlaybackState(
      accountId,
      profileId,
      contentId,
    );
    assert.equal(stored?.positionSec, 20);
  });

  it('rejects invalid clientEventId', async () => {
    const { upsert } = buildUseCase();
    await assert.rejects(
      () =>
        upsert.execute({
          accountId,
          profileId,
          deviceId: deviceA,
          clientEventId: 'not-a-uuid',
          contentId,
          position: 1,
          completed: false,
          syncVersion: 0,
        }),
      SyncError,
    );
  });
});

describe('POST /api/v1/sync/playback-state route (BE-061)', () => {
  it('maps headers and body to the use case response contract', async () => {
    const { upsert } = buildUseCase();
    const [route] = createSyncRoutes({ upsertPlaybackState: upsert });
    assert.ok(route);

    const response = await route.handler({
      method: 'POST',
      url: '/api/v1/sync/playback-state',
      headers: {
        'x-account-id': accountId,
        'x-profile-id': profileId,
        'x-device-id': deviceA,
      },
      accountId,
      body: {
        clientEventId: event1,
        contentId,
        position: 42,
        completed: false,
        syncVersion: 0,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.body as Record<string, unknown>;
    assert.equal(body.status, 'OK');
    assert.equal(body.accepted, true);
    assert.equal(body.currentVersion, 1);
    assert.equal(typeof body.serverTimestamp, 'string');
    assert.equal(body.resolvedBy, 'accepted');
  });

  it('requires profile and device context headers', async () => {
    const { upsert } = buildUseCase();
    const [route] = createSyncRoutes({ upsertPlaybackState: upsert });
    assert.ok(route);
    const response = await route.handler({
      method: 'POST',
      url: '/api/v1/sync/playback-state',
      headers: { 'x-account-id': accountId },
      accountId,
      body: {
        clientEventId: event1,
        contentId,
        position: 1,
        completed: false,
        syncVersion: 0,
      },
    });
    assert.equal(response.statusCode, 401);
  });
});
