import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeAccountEmail } from '../../src/domain/auth/account.js';
import {
  ACCESS_TOKEN_TTL_DEFAULT_SECONDS,
  assertJwtAccessAlg,
  isAllowedAccessTokenTtlSeconds,
} from '../../src/domain/auth/access-token-rules.js';
import { isPasswordPolicyCompliant } from '../../src/domain/auth/password-policy.js';
import { parseExtInfLine } from '../../src/domain/catalog/parse-extinf.js';
import { normalizeXtreamBaseUrl } from '../../src/domain/catalog/xtream-stream-url.js';
import { decidePlaybackWrite } from '../../src/domain/sync/decide-playback-write.js';
import { isFavoriteAction, isFavoriteType } from '../../src/domain/sync/favorite.js';
import { replayIfDuplicate } from '../../src/domain/sync/idempotency.js';
import {
  PLAYBACK_CONFLICT_WINDOW_MS,
  resolvePlaybackConflict,
} from '../../src/domain/sync/playback-conflict.js';
import { resolveFavoriteConflict } from '../../src/domain/sync/favorite-conflict.js';
import { AuthTokenError } from '../../src/domain/auth/auth-token-error.js';

/**
 * BE-120 umbrella: SRS §22 domain unit coverage for conflict branches,
 * idempotency, normalizers, password policy, and token rules.
 */
describe('BE-120 domain logic coverage', () => {
  const t0 = new Date('2026-11-13T12:00:00.000Z');
  const t30s = new Date(t0.getTime() + 30_000);
  const deviceA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const deviceB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const eventA = '11111111-1111-4111-8111-111111111111';

  it('covers playback conflict-resolution branches', () => {
    const accepted = resolvePlaybackConflict(null, {
      deviceId: deviceA,
      positionSec: 10,
      durationSec: null,
      completed: false,
      baseVersion: 0,
      forceReset: false,
      serverNow: t0,
    });
    assert.equal(accepted.resolvedBy, 'accepted');

    const existing = {
      syncVersion: 1,
      positionSec: 100,
      updatedAt: t0,
      lastDeviceId: deviceA,
    };
    const maxPos = resolvePlaybackConflict(existing, {
      deviceId: deviceB,
      positionSec: 50,
      durationSec: null,
      completed: false,
      baseVersion: 0,
      forceReset: false,
      serverNow: t30s,
    });
    assert.equal(maxPos.resolvedBy, 'max_position');
    assert.equal(maxPos.accepted, false);

    const force = resolvePlaybackConflict(existing, {
      deviceId: deviceB,
      positionSec: 1,
      durationSec: null,
      completed: false,
      baseVersion: 0,
      forceReset: true,
      serverNow: t30s,
    });
    assert.equal(force.resolvedBy, 'force_reset');

    const lww = resolvePlaybackConflict(existing, {
      deviceId: deviceB,
      positionSec: 200,
      durationSec: null,
      completed: false,
      baseVersion: 0,
      forceReset: false,
      serverNow: t30s,
    });
    assert.equal(lww.resolvedBy, 'lww');
    assert.equal(PLAYBACK_CONFLICT_WINDOW_MS, 60_000);
  });

  it('covers favorites LWW labeling and idempotent replay', () => {
    const fav = resolveFavoriteConflict(
      { syncVersion: 2 },
      { action: 'add', baseVersion: 1 },
    );
    assert.equal(fav.resolvedBy, 'lww');
    assert.equal(fav.accepted, true);

    const prior = {
      entity: 'playback_state' as const,
      operation: 'upsert' as const,
      accepted: false,
      resolvedBy: 'max_position' as const,
      resultVersion: 3,
      changeSeq: null,
    };
    assert.equal(replayIfDuplicate(null, 1), null);
    const replay = replayIfDuplicate(prior, 3);
    assert.equal(replay?.isReplay, true);
    assert.equal(replay?.resolvedBy, 'max_position');

    const decided = decidePlaybackWrite({
      clientEventId: eventA,
      priorEvent: prior,
      existing: {
        syncVersion: 3,
        positionSec: 90,
        updatedAt: t0,
        lastDeviceId: deviceA,
      },
      write: {
        deviceId: deviceB,
        positionSec: 1,
        durationSec: null,
        completed: false,
        baseVersion: 0,
        forceReset: true,
        serverNow: t30s,
      },
    });
    assert.equal(decided.isReplay, true);
    assert.equal(decided.operation, 'upsert');
  });

  it('covers domain normalizers used by auth, sync, and catalog', () => {
    assert.equal(normalizeAccountEmail('  A@B.Co '), 'a@b.co');
    assert.equal(isFavoriteAction('add'), true);
    assert.equal(isFavoriteType('vod'), true);
    assert.equal(
      normalizeXtreamBaseUrl('https://panel.example/player_api.php'),
      'https://panel.example',
    );
    const ext = parseExtInfLine(
      '#EXTINF:-1 tvg-id="1" group-title="News",CNN',
    );
    assert.equal(ext?.title, 'CNN');
    assert.equal(ext?.groupTitle, 'News');
  });

  it('covers password policy and access token rules', () => {
    assert.equal(isPasswordPolicyCompliant('GoodPass1!'), true);
    assert.equal(isPasswordPolicyCompliant('short1!'), false);
    assert.equal(isAllowedAccessTokenTtlSeconds(ACCESS_TOKEN_TTL_DEFAULT_SECONDS), true);
    assert.doesNotThrow(() => assertJwtAccessAlg('RS256'));
    assert.throws(() => assertJwtAccessAlg('none'), AuthTokenError);
  });
});
