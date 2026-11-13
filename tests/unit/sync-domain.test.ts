import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isClientEventId,
  parseClientEventId,
} from '../../src/domain/sync/client-event-id.js';
import { decideFavoriteWrite } from '../../src/domain/sync/decide-favorite-write.js';
import { decidePlaybackWrite } from '../../src/domain/sync/decide-playback-write.js';
import { resolveFavoriteConflict } from '../../src/domain/sync/favorite-conflict.js';
import { replayIfDuplicate } from '../../src/domain/sync/idempotency.js';
import {
  isWithinConflictWindow,
  PLAYBACK_CONFLICT_WINDOW_MS,
  resolvePlaybackConflict,
} from '../../src/domain/sync/playback-conflict.js';
import { SyncError } from '../../src/domain/sync/sync-error.js';
import type { RecordedSyncEvent } from '../../src/domain/sync/sync-types.js';
import {
  INITIAL_SYNC_VERSION,
  isOptimisticMatch,
  nextSyncVersion,
  parseSyncVersion,
  versionAfterAcceptedWrite,
} from '../../src/domain/sync/sync-version.js';

const EVENT_A = '11111111-1111-4111-8111-111111111111';
const EVENT_B = '22222222-2222-4222-8222-222222222222';
const DEVICE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEVICE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const t0 = new Date('2026-11-13T12:00:00.000Z');
const t30s = new Date(t0.getTime() + 30_000);
const t60s = new Date(t0.getTime() + 60_000);
const t61s = new Date(t0.getTime() + 61_000);

describe('sync-version (BE-060)', () => {
  it('parses non-negative integers and rejects invalid values', () => {
    assert.equal(parseSyncVersion(0), 0);
    assert.equal(parseSyncVersion(4), 4);
    assert.throws(() => parseSyncVersion(-1), SyncError);
    assert.throws(() => parseSyncVersion(1.5), SyncError);
    assert.throws(() => parseSyncVersion(Number.NaN), SyncError);
  });

  it('computes initial and next versions', () => {
    assert.equal(INITIAL_SYNC_VERSION, 1);
    assert.equal(versionAfterAcceptedWrite(null), 1);
    assert.equal(versionAfterAcceptedWrite(3), 4);
    assert.equal(nextSyncVersion(1), 2);
    assert.equal(isOptimisticMatch(4, 4), true);
    assert.equal(isOptimisticMatch(3, 4), false);
  });
});

describe('client-event-id (BE-060)', () => {
  it('normalizes valid UUIDs and rejects malformed ids', () => {
    assert.equal(parseClientEventId(` ${EVENT_A.toUpperCase()} `), EVENT_A);
    assert.equal(isClientEventId(EVENT_B), true);
    assert.equal(isClientEventId('not-a-uuid'), false);
    assert.throws(() => parseClientEventId(''), SyncError);
    assert.throws(() => parseClientEventId('11111111-1111-1111-1111-111111111111'), SyncError);
  });
});

describe('idempotency (BE-060)', () => {
  it('returns null when no prior event exists', () => {
    assert.equal(replayIfDuplicate(null, 5), null);
  });

  it('replays the prior outcome with the live entity version', () => {
    const prior: RecordedSyncEvent = {
      entity: 'playback_state',
      operation: 'upsert',
      accepted: false,
      resolvedBy: 'max_position',
      resultVersion: 7,
      changeSeq: null,
    };
    const replay = replayIfDuplicate(prior, 7);
    assert.deepEqual(replay, {
      accepted: false,
      resolvedBy: 'max_position',
      resultVersion: 7,
      isReplay: true,
    });
  });

  it('uses 0 when the entity row is missing on replay', () => {
    const prior: RecordedSyncEvent = {
      entity: 'favorite',
      operation: 'upsert',
      accepted: true,
      resolvedBy: 'accepted',
      resultVersion: 1,
      changeSeq: 10,
    };
    assert.equal(replayIfDuplicate(prior, null)?.resultVersion, 0);
  });
});

describe('playback conflict window (BE-060)', () => {
  it('treats [0, 60s] inclusive as inside the window', () => {
    assert.equal(isWithinConflictWindow(t0, t0), true);
    assert.equal(isWithinConflictWindow(t0, t30s), true);
    assert.equal(isWithinConflictWindow(t0, t60s), true);
    assert.equal(isWithinConflictWindow(t0, t61s), false);
    assert.equal(PLAYBACK_CONFLICT_WINDOW_MS, 60_000);
  });

  it('rejects negative elapsed (clock anomaly)', () => {
    assert.equal(isWithinConflictWindow(t30s, t0), false);
  });
});

describe('resolvePlaybackConflict (BE-060)', () => {
  it('accepts create with version 1', () => {
    const d = resolvePlaybackConflict(null, {
      deviceId: DEVICE_A,
      positionSec: 10,
      durationSec: 100,
      completed: false,
      baseVersion: 0,
      forceReset: false,
      serverNow: t0,
    });
    assert.deepEqual(d, {
      accepted: true,
      resolvedBy: 'accepted',
      resultVersion: 1,
      isReplay: false,
      operation: 'upsert',
    });
  });

  it('accepts optimistic match even when position rewinds', () => {
    const d = resolvePlaybackConflict(
      {
        syncVersion: 4,
        positionSec: 900,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      {
        deviceId: DEVICE_A,
        positionSec: 100,
        durationSec: null,
        completed: false,
        baseVersion: 4,
        forceReset: false,
        serverNow: t30s,
      },
    );
    assert.equal(d.accepted, true);
    assert.equal(d.resolvedBy, 'accepted');
    assert.equal(d.resultVersion, 5);
  });

  it('forceReset wins inside the window with a lower position', () => {
    const d = resolvePlaybackConflict(
      {
        syncVersion: 2,
        positionSec: 500,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      {
        deviceId: DEVICE_B,
        positionSec: 10,
        durationSec: 1000,
        completed: false,
        baseVersion: 1,
        forceReset: true,
        serverNow: t30s,
      },
    );
    assert.equal(d.accepted, true);
    assert.equal(d.resolvedBy, 'force_reset');
    assert.equal(d.operation, 'reset');
    assert.equal(d.resultVersion, 3);
  });

  it('rejects lower position from another device within 60s (max_position)', () => {
    const d = resolvePlaybackConflict(
      {
        syncVersion: 5,
        positionSec: 800,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      {
        deviceId: DEVICE_B,
        positionSec: 700,
        durationSec: null,
        completed: false,
        baseVersion: 4,
        forceReset: false,
        serverNow: t30s,
      },
    );
    assert.equal(d.accepted, false);
    assert.equal(d.resolvedBy, 'max_position');
    assert.equal(d.resultVersion, 5);
  });

  it('accepts higher position from another device within 60s as LWW', () => {
    const d = resolvePlaybackConflict(
      {
        syncVersion: 5,
        positionSec: 700,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      {
        deviceId: DEVICE_B,
        positionSec: 800,
        durationSec: null,
        completed: false,
        baseVersion: 4,
        forceReset: false,
        serverNow: t30s,
      },
    );
    assert.equal(d.accepted, true);
    assert.equal(d.resolvedBy, 'lww');
    assert.equal(d.resultVersion, 6);
  });

  it('accepts equal position within 60s as LWW (max_position needs strictly lower)', () => {
    const d = resolvePlaybackConflict(
      {
        syncVersion: 5,
        positionSec: 700,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      {
        deviceId: DEVICE_B,
        positionSec: 700,
        durationSec: null,
        completed: false,
        baseVersion: 4,
        forceReset: false,
        serverNow: t30s,
      },
    );
    assert.equal(d.accepted, true);
    assert.equal(d.resolvedBy, 'lww');
  });

  it('accepts lower position after the 60s window as LWW', () => {
    const d = resolvePlaybackConflict(
      {
        syncVersion: 5,
        positionSec: 800,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      {
        deviceId: DEVICE_B,
        positionSec: 100,
        durationSec: null,
        completed: false,
        baseVersion: 4,
        forceReset: false,
        serverNow: t61s,
      },
    );
    assert.equal(d.accepted, true);
    assert.equal(d.resolvedBy, 'lww');
  });

  it('does not apply max_position when the same device rewrites', () => {
    const d = resolvePlaybackConflict(
      {
        syncVersion: 5,
        positionSec: 800,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      {
        deviceId: DEVICE_A,
        positionSec: 100,
        durationSec: null,
        completed: false,
        baseVersion: 4,
        forceReset: false,
        serverNow: t30s,
      },
    );
    assert.equal(d.accepted, true);
    assert.equal(d.resolvedBy, 'lww');
  });

  it('treats null lastDeviceId as distinct from the incoming device', () => {
    const d = resolvePlaybackConflict(
      {
        syncVersion: 1,
        positionSec: 50,
        updatedAt: t0,
        lastDeviceId: null,
      },
      {
        deviceId: DEVICE_A,
        positionSec: 10,
        durationSec: null,
        completed: false,
        baseVersion: 0,
        forceReset: false,
        serverNow: t30s,
      },
    );
    assert.equal(d.accepted, false);
    assert.equal(d.resolvedBy, 'max_position');
  });

  it('rejects invalid position and duration', () => {
    assert.throws(
      () =>
        resolvePlaybackConflict(null, {
          deviceId: DEVICE_A,
          positionSec: -1,
          durationSec: null,
          completed: false,
          baseVersion: 0,
          forceReset: false,
          serverNow: t0,
        }),
      SyncError,
    );
    assert.throws(
      () =>
        resolvePlaybackConflict(null, {
          deviceId: DEVICE_A,
          positionSec: 1,
          durationSec: -5,
          completed: false,
          baseVersion: 0,
          forceReset: false,
          serverNow: t0,
        }),
      SyncError,
    );
  });

  it('labels create with forceReset as accepted (no prior row)', () => {
    const d = resolvePlaybackConflict(null, {
      deviceId: DEVICE_A,
      positionSec: 0,
      durationSec: null,
      completed: false,
      baseVersion: 0,
      forceReset: true,
      serverNow: t0,
    });
    assert.equal(d.resolvedBy, 'accepted');
    assert.equal(d.operation, 'reset');
    assert.equal(d.accepted, true);
  });
});

describe('resolveFavoriteConflict (BE-060)', () => {
  it('creates with accepted / version 1', () => {
    const d = resolveFavoriteConflict(null, {
      action: 'add',
      baseVersion: 0,
    });
    assert.deepEqual(d, {
      accepted: true,
      resolvedBy: 'accepted',
      resultVersion: 1,
      isReplay: false,
      operation: 'upsert',
    });
  });

  it('marks concurrent base mismatch as lww and always accepts', () => {
    const match = resolveFavoriteConflict(
      { syncVersion: 2 },
      { action: 'remove', baseVersion: 2 },
    );
    assert.equal(match.resolvedBy, 'accepted');
    assert.equal(match.operation, 'delete');
    assert.equal(match.resultVersion, 3);

    const concurrent = resolveFavoriteConflict(
      { syncVersion: 2 },
      { action: 'add', baseVersion: 1 },
    );
    assert.equal(concurrent.accepted, true);
    assert.equal(concurrent.resolvedBy, 'lww');
    assert.equal(concurrent.resultVersion, 3);
  });
});

describe('decidePlaybackWrite / decideFavoriteWrite (BE-060)', () => {
  it('short-circuits playback on duplicate clientEventId', () => {
    const prior: RecordedSyncEvent = {
      entity: 'playback_state',
      operation: 'upsert',
      accepted: false,
      resolvedBy: 'max_position',
      resultVersion: 5,
      changeSeq: null,
    };
    const d = decidePlaybackWrite({
      clientEventId: EVENT_A,
      priorEvent: prior,
      existing: {
        syncVersion: 5,
        positionSec: 900,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      write: {
        deviceId: DEVICE_B,
        positionSec: 1,
        durationSec: null,
        completed: false,
        baseVersion: 4,
        forceReset: true,
        serverNow: t30s,
      },
    });
    assert.equal(d.isReplay, true);
    assert.equal(d.accepted, false);
    assert.equal(d.resolvedBy, 'max_position');
    assert.equal(d.resultVersion, 5);
    assert.equal(d.operation, 'upsert');
  });

  it('runs conflict rules when clientEventId is new', () => {
    const d = decidePlaybackWrite({
      clientEventId: EVENT_B,
      priorEvent: null,
      existing: {
        syncVersion: 1,
        positionSec: 100,
        updatedAt: t0,
        lastDeviceId: DEVICE_A,
      },
      write: {
        deviceId: DEVICE_B,
        positionSec: 50,
        durationSec: null,
        completed: false,
        baseVersion: 0,
        forceReset: false,
        serverNow: t30s,
      },
    });
    assert.equal(d.isReplay, false);
    assert.equal(d.resolvedBy, 'max_position');
    assert.equal(d.accepted, false);
  });

  it('replays favorites without re-applying LWW', () => {
    const prior: RecordedSyncEvent = {
      entity: 'favorite',
      operation: 'upsert',
      accepted: true,
      resolvedBy: 'lww',
      resultVersion: 4,
      changeSeq: 99,
    };
    const d = decideFavoriteWrite({
      clientEventId: EVENT_A,
      priorEvent: prior,
      existing: { syncVersion: 9 },
      write: { action: 'remove', baseVersion: 1 },
    });
    assert.equal(d.isReplay, true);
    assert.equal(d.resolvedBy, 'lww');
    assert.equal(d.resultVersion, 9);
    assert.equal(d.operation, 'upsert');
  });

  it('rejects invalid clientEventId before resolving', () => {
    assert.throws(
      () =>
        decidePlaybackWrite({
          clientEventId: 'bad',
          priorEvent: null,
          existing: null,
          write: {
            deviceId: DEVICE_A,
            positionSec: 1,
            durationSec: null,
            completed: false,
            baseVersion: 0,
            forceReset: false,
            serverNow: t0,
          },
        }),
      SyncError,
    );
  });
});
