import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { AssertAccessTokenActive } from '../../src/application/auth/assert-access-token-active.js';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { LoginAccount } from '../../src/application/auth/login-account.js';
import { LogoutAccount } from '../../src/application/auth/logout-account.js';
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
import { InMemoryRefreshTokenRepository } from '../../src/infrastructure/persistence/in-memory-refresh-token-repository.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { createAuthRoutes } from '../../src/presentation/http/routes/auth-routes.js';
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
  const issuePair = new IssueAuthTokenPair(access, refreshService);
  const denyList = new RedisAccessTokenDenyList(new InMemoryRedisClient());
  const login = new LoginAccount(accounts, hasher, issuePair, refreshTokens);
  const refreshSession = new RefreshAuthSession(
    accounts,
    refreshService,
    refreshTokens,
    issuePair,
  );
  const logout = new LogoutAccount(
    access,
    denyList,
    refreshTokens,
    ttl.accessTokenTtlSeconds,
  );
  const assertActive = new AssertAccessTokenActive(access, denyList);
  return {
    login,
    refreshSession,
    logout,
    assertActive,
    denyList,
    accounts,
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
  const email = 'logout@example.com';
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

describe('BE-025 LogoutAccount', () => {
  it('revokes the current device refresh tokens and deny-lists the access jti', async () => {
    const {
      login,
      logout,
      assertActive,
      accounts,
      hasher,
      refreshTokens,
      refreshService,
      refreshSession,
    } = await createStack();
    const password = 'logout-device-1!';
    const { email } = await seedAccount(accounts, hasher, password);
    const deviceA = randomUUID();
    const deviceB = randomUUID();

    const sessionA = await login.execute({
      email,
      password,
      deviceId: deviceA,
    });
    const sessionB = await login.execute({
      email,
      password,
      deviceId: deviceB,
    });

    const result = await logout.execute({
      accessToken: sessionA.accessToken,
    });
    assert.equal(result.status, 'OK');
    assert.equal(result.scope, 'device');

    await assert.rejects(
      () => assertActive.execute(sessionA.accessToken),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'AUTH_ACCESS_REVOKED',
    );

    const refreshA = await refreshTokens.findByTokenHash(
      refreshService.hash(sessionA.refreshToken),
    );
    assert.ok(refreshA?.revokedAt);
    assert.equal(refreshA?.revokedReason, 'logout');

    await assert.rejects(
      () => refreshSession.execute({ refreshToken: sessionA.refreshToken }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'AUTH_REFRESH_REVOKED',
    );

    // Other device remains usable.
    await assertActive.execute(sessionB.accessToken);
    const rotatedB = await refreshSession.execute({
      refreshToken: sessionB.refreshToken,
    });
    assert.ok(rotatedB.accessToken);
  });

  it('offers closing all account sessions via allSessions', async () => {
    const {
      login,
      logout,
      assertActive,
      accounts,
      hasher,
      refreshTokens,
      refreshService,
      refreshSession,
    } = await createStack();
    const password = 'logout-all-1!';
    const { email } = await seedAccount(accounts, hasher, password);
    const sessionA = await login.execute({
      email,
      password,
      deviceId: randomUUID(),
    });
    const sessionB = await login.execute({
      email,
      password,
      deviceId: randomUUID(),
    });

    const result = await logout.execute({
      accessToken: sessionA.accessToken,
      allSessions: true,
    });
    assert.equal(result.scope, 'account');

    await assert.rejects(() => assertActive.execute(sessionA.accessToken));
    await assert.rejects(() => assertActive.execute(sessionB.accessToken));

    const refreshB = await refreshTokens.findByTokenHash(
      refreshService.hash(sessionB.refreshToken),
    );
    assert.ok(refreshB?.revokedAt);
    assert.equal(refreshB?.revokedReason, 'logout_all');

    await assert.rejects(() =>
      refreshSession.execute({ refreshToken: sessionB.refreshToken }),
    );
  });

  it('HTTP logout route is catalogued and accepts Bearer token', async () => {
    const { login, refreshSession, logout, accounts, hasher } =
      await createStack();
    const password = 'http-logout-1!';
    const { email } = await seedAccount(accounts, hasher, password);
    const routes = createAuthRoutes({
      registerAccount: {
        execute: async () => {
          throw new Error('unused');
        },
      } as never,
      loginAccount: login,
      refreshAuthSession: refreshSession,
      logoutAccount: logout,
    });
    const logoutRoute = routes.find(
      (route) => route.path === '/api/v1/auth/logout',
    );
    assert.ok(logoutRoute);
    const catalog = ROUTE_CATALOG.find(
      (entry) =>
        entry.method === logoutRoute.method &&
        entry.path === logoutRoute.path,
    );
    assert.equal(catalog?.operationId, 'logout');

    const session = await login.execute({
      email,
      password,
      deviceId: randomUUID(),
    });
    const response = await logoutRoute.handler({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: {},
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { status: 'OK', scope: 'device' });
  });
});
