import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DeleteAccount } from '../../src/application/account/delete-account.js';
import { ExportAccountData } from '../../src/application/account/export-account-data.js';
import { AssertAccessTokenActive } from '../../src/application/auth/assert-access-token-active.js';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { LoginAccount } from '../../src/application/auth/login-account.js';
import { RefreshAuthSession } from '../../src/application/auth/refresh-auth-session.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { RedisAccessTokenDenyList } from '../../src/infrastructure/cache/redis-access-token-deny-list.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { InMemoryAccountRepository } from '../../src/infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryDeviceRepository } from '../../src/infrastructure/persistence/in-memory-device-repository.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemoryRefreshTokenRepository } from '../../src/infrastructure/persistence/in-memory-refresh-token-repository.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';
import { InMemorySyncLogRepository } from '../../src/infrastructure/persistence/in-memory-sync-log-repository.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { createAccountRoutes } from '../../src/presentation/http/routes/account-routes.js';
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
  const refreshService = new OpaqueRefreshTokenService(ttl);
  const hasher = new Argon2PasswordHasher(testHashParams);
  const accounts = new InMemoryAccountRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const profiles = new InMemoryProfileRepository();
  const devices = new InMemoryDeviceRepository();
  const sources = new InMemorySourceRepository();
  const syncLog = new InMemorySyncLogRepository();
  const favorites = new InMemoryFavoriteSyncRepository(syncLog);
  const playback = new InMemoryPlaybackSyncRepository(syncLog);
  const issuePair = new IssueAuthTokenPair(access, refreshService);
  const denyList = new RedisAccessTokenDenyList(new InMemoryRedisClient());
  const login = new LoginAccount(accounts, hasher, issuePair, refreshTokens);
  const refreshSession = new RefreshAuthSession(
    accounts,
    refreshService,
    refreshTokens,
    issuePair,
  );
  const exportAccountData = new ExportAccountData(
    access,
    accounts,
    profiles,
    devices,
    sources,
    favorites,
    playback,
  );
  const deleteAccount = new DeleteAccount(
    access,
    denyList,
    refreshTokens,
    accounts,
    profiles,
    sources,
    devices,
    favorites,
    playback,
    syncLog,
    ttl.accessTokenTtlSeconds,
  );
  const assertActive = new AssertAccessTokenActive(access, denyList);
  return {
    login,
    refreshSession,
    exportAccountData,
    deleteAccount,
    assertActive,
    accounts,
    profiles,
    devices,
    sources,
    favorites,
    playback,
    syncLog,
    refreshTokens,
    hasher,
    refreshService,
  };
}

async function seedAccount(
  accounts: InMemoryAccountRepository,
  hasher: Argon2PasswordHasher,
  password: string,
): Promise<{ accountId: string; email: string }> {
  const accountId = randomUUID();
  const email = 'delete-export@example.com';
  const now = new Date();
  await accounts.insert({
    id: accountId,
    email,
    passwordHash: await hasher.hash(password),
    role: 'user',
    status: 'active',
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { accountId, email };
}

describe('BE-013 account deletion and export', () => {
  it('exports account-owned data without secrets', async () => {
    const {
      login,
      exportAccountData,
      accounts,
      profiles,
      devices,
      sources,
      favorites,
      playback,
      hasher,
    } = await createStack();
    const password = 'Export-Account-1!';
    const { accountId, email } = await seedAccount(accounts, hasher, password);
    const profileId = randomUUID();
    const deviceId = randomUUID();
    const sourceId = randomUUID();
    const itemId = randomUUID();
    const contentId = randomUUID();
    const now = new Date();

    await profiles.insert({
      id: profileId,
      accountId,
      name: 'Default',
      avatar: null,
      language: 'es',
      region: 'CO',
      isDefault: true,
      autoplay: true,
      subtitlePrefs: {},
      restrictions: {},
      pinHash: null,
    });
    await devices.insert({
      id: deviceId,
      accountId,
      deviceType: 'tv',
      platform: 'android_tv',
      name: 'Salon',
      model: null,
      appVersion: '1.0.0',
      osVersion: null,
      pushToken: 'secret-push-token',
    });
    await sources.insert({
      id: sourceId,
      accountId,
      kind: 'm3u',
      name: 'Home M3U',
      uriRef: 'https://cdn.example/list.m3u',
      credentialsEncrypted: new Uint8Array([1, 2, 3, 4]),
      encKeyId: 'kms-dev',
      priority: 100,
      enabled: true,
      status: 'ok',
      statusReason: null,
    });
    await favorites.applyFavoriteWrite({
      accountId,
      profileId,
      deviceId,
      clientEventId: randomUUID(),
      itemId,
      action: 'add',
      type: 'vod',
      sortOrder: 1,
      clientReportedAt: null,
      resolvedBy: 'accepted',
      operation: 'upsert',
      resultVersion: 1,
      serverNow: now,
    });
    await playback.applyPlaybackWrite({
      accountId,
      profileId,
      deviceId,
      clientEventId: randomUUID(),
      contentId,
      sourceId,
      positionSec: 42,
      durationSec: 100,
      completed: false,
      clientReportedAt: null,
      accepted: true,
      resolvedBy: 'accepted',
      operation: 'upsert',
      resultVersion: 1,
      serverNow: now,
    });

    const session = await login.execute({
      email,
      password,
      deviceId,
    });
    const exported = await exportAccountData.execute({
      accessToken: session.accessToken,
    });

    assert.equal(exported.account.email, email);
    assert.equal(exported.profiles.length, 1);
    assert.equal(exported.devices.length, 1);
    assert.equal(exported.devices[0]?.pushTokenConfigured, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(exported.devices[0], 'pushToken'),
      false,
    );
    assert.equal(exported.sources.length, 1);
    assert.equal(exported.sources[0]?.credentialsConfigured, true);
    assert.equal(exported.sources[0]?.password, null);
    assert.equal(exported.sources[0]?.username, null);
    assert.equal(exported.sources[0]?.token, null);
    assert.equal(
      JSON.stringify(exported).includes('secret-push-token'),
      false,
    );
    assert.equal(JSON.stringify(exported).includes('kms-dev'), false);
    assert.equal(exported.favorites.length, 1);
    assert.equal(exported.favorites[0]?.itemId, itemId);
    assert.equal(exported.playbackStates.length, 1);
    assert.equal(exported.playbackStates[0]?.positionSec, 42);
    assert.equal(
      Object.prototype.hasOwnProperty.call(exported.account, 'passwordHash'),
      false,
    );
  });

  it('revokes tokens and cascade-deletes account tenant data', async () => {
    const {
      login,
      refreshSession,
      deleteAccount,
      assertActive,
      accounts,
      profiles,
      devices,
      sources,
      favorites,
      playback,
      syncLog,
      refreshTokens,
      refreshService,
      hasher,
    } = await createStack();
    const password = 'Delete-Account-1!';
    const { accountId, email } = await seedAccount(accounts, hasher, password);
    const profileId = randomUUID();
    const deviceId = randomUUID();
    const otherAccountId = randomUUID();
    const now = new Date();

    await accounts.insert({
      id: otherAccountId,
      email: 'keep@example.com',
      passwordHash: await hasher.hash(password),
      role: 'user',
      status: 'active',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await profiles.insert({
      id: profileId,
      accountId,
      name: 'Default',
      avatar: null,
      language: 'es',
      region: null,
      isDefault: true,
      autoplay: true,
      subtitlePrefs: {},
      restrictions: {},
      pinHash: null,
    });
    await profiles.insert({
      id: randomUUID(),
      accountId: otherAccountId,
      name: 'Other',
      avatar: null,
      language: 'en',
      region: null,
      isDefault: true,
      autoplay: true,
      subtitlePrefs: {},
      restrictions: {},
      pinHash: null,
    });
    await devices.insert({
      id: deviceId,
      accountId,
      deviceType: 'companion',
      platform: 'android',
      name: 'Phone',
      model: null,
      appVersion: null,
      osVersion: null,
      pushToken: 'token',
    });
    await sources.insert({
      id: randomUUID(),
      accountId,
      kind: 'xtream',
      name: 'Xtream',
      uriRef: 'host.example',
      credentialsEncrypted: new Uint8Array([9, 9]),
      encKeyId: 'k1',
      priority: 10,
      enabled: true,
      status: 'pending',
      statusReason: null,
    });
    const favoriteEventId = randomUUID();
    const playbackEventId = randomUUID();
    await favorites.applyFavoriteWrite({
      accountId,
      profileId,
      deviceId,
      clientEventId: favoriteEventId,
      itemId: randomUUID(),
      action: 'add',
      type: 'channel',
      sortOrder: 0,
      clientReportedAt: null,
      resolvedBy: 'accepted',
      operation: 'upsert',
      resultVersion: 1,
      serverNow: now,
    });
    await playback.applyPlaybackWrite({
      accountId,
      profileId,
      deviceId,
      clientEventId: playbackEventId,
      contentId: randomUUID(),
      sourceId: null,
      positionSec: 1,
      durationSec: 10,
      completed: false,
      clientReportedAt: null,
      accepted: true,
      resolvedBy: 'accepted',
      operation: 'upsert',
      resultVersion: 1,
      serverNow: now,
    });

    const session = await login.execute({
      email,
      password,
      deviceId,
    });
    const refreshHash = refreshService.hash(session.refreshToken);

    const result = await deleteAccount.execute({
      accessToken: session.accessToken,
    });
    assert.equal(result.status, 'OK');
    assert.equal(result.accountId, accountId);

    await assert.rejects(
      () => assertActive.execute(session.accessToken),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'AUTH_ACCESS_REVOKED',
    );
    await assert.rejects(
      () =>
        refreshSession.execute({
          refreshToken: session.refreshToken,
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        (error.code === 'AUTH_REFRESH_INVALID' ||
          error.code === 'AUTH_REFRESH_REVOKED'),
    );

    assert.equal(await accounts.findById(accountId), null);
    assert.equal((await profiles.listByAccount(accountId)).length, 0);
    assert.equal((await devices.listAllByAccount(accountId)).length, 0);
    assert.equal((await sources.listAllByAccount(accountId)).length, 0);
    assert.equal((await favorites.listFavoritesByAccount(accountId)).length, 0);
    assert.equal((await playback.listPlaybackByAccount(accountId)).length, 0);
    assert.equal(await refreshTokens.findByTokenHash(refreshHash), null);
    assert.equal(
      await syncLog.findByClientEventId(accountId, favoriteEventId),
      null,
    );
    assert.equal(
      await syncLog.findByClientEventId(accountId, playbackEventId),
      null,
    );

    assert.notEqual(await accounts.findById(otherAccountId), null);
    assert.equal((await profiles.listByAccount(otherAccountId)).length, 1);
  });

  it('registers account export and delete routes in the catalog', async () => {
    const { exportAccountData, deleteAccount } = await createStack();
    const routes = createAccountRoutes({
      exportAccountData,
      deleteAccount,
    });
    assert.equal(
      routes.some(
        (route) =>
          route.method === 'GET' && route.path === '/api/v1/account/export',
      ),
      true,
    );
    assert.equal(
      routes.some(
        (route) =>
          route.method === 'DELETE' && route.path === '/api/v1/account',
      ),
      true,
    );
    assert.equal(
      ROUTE_CATALOG.some(
        (entry) => entry.operationId === 'exportAccountData',
      ),
      true,
    );
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'deleteAccount'),
      true,
    );
  });
});
