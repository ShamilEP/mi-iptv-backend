import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { RegisterAccount } from '../../src/application/auth/register-account.js';
import { ClearWatchHistory } from '../../src/application/history/clear-watch-history.js';
import { ListWatchHistory } from '../../src/application/history/list-watch-history.js';
import { RecordWatchHistory } from '../../src/application/history/record-watch-history.js';
import {
  GetWatchHistoryPrivacy,
  UpdateWatchHistoryPrivacy,
} from '../../src/application/history/update-watch-history-privacy.js';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { CreateProfile } from '../../src/application/profiles/create-profile.js';
import { UpsertPlaybackState } from '../../src/application/sync/upsert-playback-state.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { InMemoryAccountRepository } from '../../src/infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemoryRefreshTokenRepository } from '../../src/infrastructure/persistence/in-memory-refresh-token-repository.js';
import { InMemoryWatchHistoryRepository } from '../../src/infrastructure/persistence/in-memory-watch-history-repository.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { createProfilesHistoryRoutes } from '../../src/presentation/http/routes/profiles-history-routes.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';

const testHashParams = loadPasswordHashParams({
  PASSWORD_ARGON2_MEMORY_KIB: '19456',
  PASSWORD_ARGON2_TIME_COST: '2',
  PASSWORD_ARGON2_PARALLELISM: '1',
});

async function createStack() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const store = new EnvJwtSigningKeyStore({
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    activeKid: 'test-kid',
  });
  const ttl = loadJwtTokenTtlConfig({});
  const access = new NodeRs256AccessTokenService(store, ttl);
  const refresh = new OpaqueRefreshTokenService(ttl);
  const hasher = new Argon2PasswordHasher(testHashParams);
  const profiles = new InMemoryProfileRepository();
  const history = new InMemoryWatchHistoryRepository();
  const playback = new InMemoryPlaybackSyncRepository();
  const listWatchHistory = new ListWatchHistory(access, profiles, history);
  const recordWatchHistory = new RecordWatchHistory(access, profiles, history);
  const clearWatchHistory = new ClearWatchHistory(access, profiles, history);
  const getWatchHistoryPrivacy = new GetWatchHistoryPrivacy(access, profiles);
  const updateWatchHistoryPrivacy = new UpdateWatchHistoryPrivacy(
    access,
    profiles,
  );
  const register = new RegisterAccount(
    new InMemoryAccountRepository(),
    hasher,
    new IssueAuthTokenPair(access, refresh),
    new InMemoryRefreshTokenRepository(),
    new CreateDefaultProfile(profiles),
  );
  return {
    register,
    profiles,
    history,
    playback,
    createProfile: new CreateProfile(access, profiles),
    listHistory: listWatchHistory,
    recordHistory: recordWatchHistory,
    clearHistory: clearWatchHistory,
    getPrivacy: getWatchHistoryPrivacy,
    updatePrivacy: updateWatchHistoryPrivacy,
    upsertPlayback: new UpsertPlaybackState(playback, profiles),
    routes: createProfilesHistoryRoutes({
      listWatchHistory,
      recordWatchHistory,
      clearWatchHistory,
      getWatchHistoryPrivacy,
      updateWatchHistoryPrivacy,
    }),
  };
}

describe('BE-105 watch history', () => {
  it('registers catalog routes for history and privacy', () => {
    const ops = new Set(ROUTE_CATALOG.map((e) => `${e.method} ${e.path}`));
    assert.ok(ops.has('GET /api/v1/profiles/{id}/history'));
    assert.ok(ops.has('POST /api/v1/profiles/{id}/history'));
    assert.ok(ops.has('DELETE /api/v1/profiles/{id}/history'));
    assert.ok(ops.has('GET /api/v1/profiles/{id}/privacy'));
    assert.ok(ops.has('PATCH /api/v1/profiles/{id}/privacy'));
  });

  it('records, lists, and clears history without touching playback_states', async () => {
    const api = await createStack();
    const session = await api.register.execute({
      email: 'history@example.com',
      password: 'History-ok-1!',
      deviceId: randomUUID(),
    });
    const profileId = (
      await api.profiles.listByAccount(session.accountId)
    )[0]!.id;
    const contentId = randomUUID();

    const recorded = await api.recordHistory.execute({
      accessToken: session.accessToken,
      profileId,
      contentId,
      positionSec: 120,
      completed: false,
    });
    assert.equal(recorded.contentId, contentId);

    await api.upsertPlayback.execute({
      accountId: session.accountId,
      profileId,
      deviceId: randomUUID(),
      clientEventId: randomUUID(),
      contentId,
      position: 120,
      completed: false,
      syncVersion: 0,
    });

    const listed = await api.listHistory.execute({
      accessToken: session.accessToken,
      profileId,
    });
    assert.equal(listed.historyEnabled, true);
    assert.equal(listed.items.length, 1);

    const playbackBefore = await api.playback.listPlaybackByProfile(
      session.accountId,
      profileId,
    );
    assert.equal(playbackBefore.length, 1);

    const cleared = await api.clearHistory.execute({
      accessToken: session.accessToken,
      profileId,
    });
    assert.equal(cleared.cleared, true);
    assert.equal(cleared.deletedCount, 1);

    const afterClear = await api.listHistory.execute({
      accessToken: session.accessToken,
      profileId,
    });
    assert.equal(afterClear.items.length, 0);

    const playbackAfter = await api.playback.listPlaybackByProfile(
      session.accountId,
      profileId,
    );
    assert.equal(playbackAfter.length, 1);
  });

  it('honors privacy toggle and scopes by profile', async () => {
    const api = await createStack();
    const session = await api.register.execute({
      email: 'privacy-hist@example.com',
      password: 'Privacy-ok-1!',
      deviceId: randomUUID(),
    });
    const defaultId = (
      await api.profiles.listByAccount(session.accountId)
    )[0]!.id;
    const secondary = await api.createProfile.execute({
      accessToken: session.accessToken,
      name: 'Kids',
    });

    await api.recordHistory.execute({
      accessToken: session.accessToken,
      profileId: defaultId,
      contentId: randomUUID(),
    });
    await api.recordHistory.execute({
      accessToken: session.accessToken,
      profileId: secondary.id,
      contentId: randomUUID(),
    });

    const defaultList = await api.listHistory.execute({
      accessToken: session.accessToken,
      profileId: defaultId,
    });
    const secondaryList = await api.listHistory.execute({
      accessToken: session.accessToken,
      profileId: secondary.id,
    });
    assert.equal(defaultList.items.length, 1);
    assert.equal(secondaryList.items.length, 1);
    assert.notEqual(
      defaultList.items[0]?.contentId,
      secondaryList.items[0]?.contentId,
    );

    const privacy = await api.updatePrivacy.execute({
      accessToken: session.accessToken,
      profileId: defaultId,
      historyEnabled: false,
    });
    assert.equal(privacy.historyEnabled, false);

    const hidden = await api.listHistory.execute({
      accessToken: session.accessToken,
      profileId: defaultId,
    });
    assert.equal(hidden.historyEnabled, false);
    assert.equal(hidden.items.length, 0);

    await assert.rejects(
      () =>
        api.recordHistory.execute({
          accessToken: session.accessToken,
          profileId: defaultId,
          contentId: randomUUID(),
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'HISTORY_PRIVACY_DISABLED',
    );

    await api.updatePrivacy.execute({
      accessToken: session.accessToken,
      profileId: defaultId,
      historyEnabled: true,
    });
    const restored = await api.listHistory.execute({
      accessToken: session.accessToken,
      profileId: defaultId,
    });
    assert.equal(restored.items.length, 1);
  });

  it('exposes history routes over HTTP', async () => {
    const api = await createStack();
    const session = await api.register.execute({
      email: 'http-hist@example.com',
      password: 'Http-hist-1!',
      deviceId: randomUUID(),
    });
    const profileId = (
      await api.profiles.listByAccount(session.accountId)
    )[0]!.id;
    const route = api.routes.find(
      (r) => r.method === 'POST' && r.path === '/api/v1/profiles/{id}/history',
    );
    assert.ok(route);
    const response = await route.handler({
      method: 'POST',
      url: `/api/v1/profiles/${profileId}/history`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      params: { id: profileId },
      body: { contentId: randomUUID(), completed: true },
    });
    assert.equal(response.statusCode, 201);

    const privacyRoute = api.routes.find(
      (r) => r.method === 'PATCH' && r.path === '/api/v1/profiles/{id}/privacy',
    );
    assert.ok(privacyRoute);
    const privacyResponse = await privacyRoute.handler({
      method: 'PATCH',
      url: `/api/v1/profiles/${profileId}/privacy`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      params: { id: profileId },
      body: { historyEnabled: false },
    });
    assert.equal(privacyResponse.statusCode, 200);
    assert.equal(
      (privacyResponse.body as { historyEnabled: boolean }).historyEnabled,
      false,
    );
  });
});
