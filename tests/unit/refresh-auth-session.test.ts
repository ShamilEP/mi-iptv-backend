import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
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

async function createAuthStack(): Promise<{
  readonly login: LoginAccount;
  readonly refreshSession: RefreshAuthSession;
  readonly logout: LogoutAccount;
  readonly accounts: InMemoryAccountRepository;
  readonly refreshTokens: InMemoryRefreshTokenRepository;
  readonly hasher: Argon2PasswordHasher;
  readonly access: NodeRs256AccessTokenService;
  readonly refreshService: OpaqueRefreshTokenService;
}> {
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
  const login = new LoginAccount(accounts, hasher, issuePair, refreshTokens);
  const refreshSession = new RefreshAuthSession(
    accounts,
    refreshService,
    refreshTokens,
    issuePair,
  );
  const logout = new LogoutAccount(
    access,
    new RedisAccessTokenDenyList(new InMemoryRedisClient()),
    refreshTokens,
    ttl.accessTokenTtlSeconds,
  );
  return {
    login,
    refreshSession,
    logout,
    accounts,
    refreshTokens,
    hasher,
    access,
    refreshService,
  };
}

async function seedActiveAccount(
  accounts: InMemoryAccountRepository,
  hasher: Argon2PasswordHasher,
  password: string,
): Promise<{ readonly accountId: string; readonly email: string }> {
  const accountId = randomUUID();
  const email = 'refresh@example.com';
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

describe('BE-024 RefreshAuthSession', () => {
  it('issues a new access token and rotates the refresh token in the same family', async () => {
    const {
      login,
      refreshSession,
      refreshTokens,
      hasher,
      access,
      refreshService,
      accounts,
    } = await createAuthStack();
    const password = 'rotate-me-1!';
    const { accountId, email } = await seedActiveAccount(
      accounts,
      hasher,
      password,
    );
    const deviceId = randomUUID();

    const loggedIn = await login.execute({ email, password, deviceId });
    const rotated = await refreshSession.execute({
      refreshToken: loggedIn.refreshToken,
    });

    assert.equal(rotated.accountId, accountId);
    assert.equal(rotated.expiresIn, 3600);
    assert.notEqual(rotated.refreshToken, loggedIn.refreshToken);
    assert.notEqual(rotated.accessToken, loggedIn.accessToken);

    const claims = access.verify(rotated.accessToken);
    assert.equal(claims.accountId, accountId);
    assert.equal(claims.deviceId, deviceId);

    const oldHash = refreshService.hash(loggedIn.refreshToken);
    const oldRow = await refreshTokens.findByTokenHash(oldHash);
    assert.ok(oldRow?.usedAt);
    assert.ok(oldRow?.replacedBy);

    const newHash = refreshService.hash(rotated.refreshToken);
    const newRow = await refreshTokens.findByTokenHash(newHash);
    assert.ok(newRow);
    assert.equal(newRow.familyId, oldRow!.familyId);
    assert.equal(newRow.deviceId, deviceId);
    assert.equal(newRow.usedAt, null);
    assert.equal(newRow.revokedAt, null);
    assert.equal(oldRow!.replacedBy, newRow.id);
  });

  it('detects refresh reuse and revokes the family', async () => {
    const {
      login,
      refreshSession,
      refreshTokens,
      hasher,
      refreshService,
      accounts,
    } = await createAuthStack();
    const password = 'reuse-me-1!';
    const { email } = await seedActiveAccount(accounts, hasher, password);
    const deviceId = randomUUID();

    const loggedIn = await login.execute({ email, password, deviceId });
    const firstRefresh = loggedIn.refreshToken;
    const rotated = await refreshSession.execute({ refreshToken: firstRefresh });

    const reuse = await refreshSession
      .execute({ refreshToken: firstRefresh })
      .then(
        () => null,
        (error: unknown) => error,
      );
    assert.ok(reuse instanceof DomainError);
    assert.equal(reuse.code, 'AUTH_REFRESH_REUSE');

    const oldHash = refreshService.hash(firstRefresh);
    const oldRow = await refreshTokens.findByTokenHash(oldHash);
    assert.ok(oldRow?.revokedAt);
    assert.equal(oldRow?.revokedReason, 'reuse_detected');

    const newHash = refreshService.hash(rotated.refreshToken);
    const newRow = await refreshTokens.findByTokenHash(newHash);
    assert.ok(newRow?.revokedAt);
    assert.equal(newRow?.revokedReason, 'reuse_detected');

    await assert.rejects(
      () =>
        refreshSession.execute({ refreshToken: rotated.refreshToken }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'AUTH_REFRESH_REVOKED',
    );
  });

  it('rejects unknown and revoked refresh tokens', async () => {
    const { refreshSession } = await createAuthStack();

    await assert.rejects(
      () => refreshSession.execute({ refreshToken: 'not-a-real-token' }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'AUTH_REFRESH_INVALID',
    );
  });

  it('HTTP refresh route is catalogued and maps reuse to 401', async () => {
    const { login, refreshSession, logout, accounts, hasher } =
      await createAuthStack();
    const password = 'http-refresh-1!';
    const { email } = await seedActiveAccount(accounts, hasher, password);
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
    const refreshRoute = routes.find(
      (route) => route.path === '/api/v1/auth/refresh',
    );
    assert.ok(refreshRoute);
    const catalog = ROUTE_CATALOG.find(
      (entry) =>
        entry.method === refreshRoute.method &&
        entry.path === refreshRoute.path,
    );
    assert.equal(catalog?.operationId, 'refresh');

    const loggedIn = await login.execute({
      email,
      password,
      deviceId: randomUUID(),
    });
    await refreshSession.execute({ refreshToken: loggedIn.refreshToken });

    const response = await refreshRoute.handler({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {},
      body: { refreshToken: loggedIn.refreshToken },
    });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      error: 'Refresh token reuse detected',
      code: 'AUTH_REFRESH_REUSE',
    });
  });
});
