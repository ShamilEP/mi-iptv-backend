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

async function createLoginStack(): Promise<{
  readonly login: LoginAccount;
  readonly refreshSession: RefreshAuthSession;
  readonly logout: LogoutAccount;
  readonly accounts: InMemoryAccountRepository;
  readonly refreshTokens: InMemoryRefreshTokenRepository;
  readonly hasher: Argon2PasswordHasher;
  readonly access: NodeRs256AccessTokenService;
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
  const refresh = new OpaqueRefreshTokenService(ttl);
  const hasher = new Argon2PasswordHasher(testHashParams);
  const accounts = new InMemoryAccountRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const issuePair = new IssueAuthTokenPair(access, refresh);
  const login = new LoginAccount(
    accounts,
    hasher,
    issuePair,
    refreshTokens,
  );
  const refreshSession = new RefreshAuthSession(
    accounts,
    refresh,
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
  };
}

describe('BE-022 LoginAccount', () => {
  it('authenticates email/password, binds refresh to deviceId, returns tokens', async () => {
    const { login, accounts, refreshTokens, hasher, access } =
      await createLoginStack();
    const accountId = randomUUID();
    const deviceId = randomUUID();
    const password = 'correct-horse-battery-1!';
    const now = new Date();

    await accounts.insert({
      id: accountId,
      email: 'User@Example.com',
      passwordHash: await hasher.hash(password),
      role: 'user',
      status: 'active',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await login.execute({
      email: 'user@example.com',
      password,
      deviceId,
    });

    assert.equal(result.accountId, accountId);
    assert.equal(result.expiresIn, 3600);
    assert.ok(result.accessToken.length > 20);
    assert.ok(result.refreshToken.length > 20);

    const claims = access.verify(result.accessToken);
    assert.equal(claims.accountId, accountId);
    assert.equal(claims.deviceId, deviceId);

    const stored = await accounts.findById(accountId);
    assert.ok(stored?.lastLoginAt);

    const hash = new OpaqueRefreshTokenService(
      loadJwtTokenTtlConfig({}),
    ).hash(result.refreshToken);
    const refreshRow = await refreshTokens.findByTokenHash(hash);
    assert.ok(refreshRow);
    assert.equal(refreshRow.accountId, accountId);
    assert.equal(refreshRow.deviceId, deviceId);
    assert.equal(refreshRow.revokedAt, null);
  });

  it('returns the same AUTH_INVALID for unknown email and wrong password', async () => {
    const { login, accounts, hasher } = await createLoginStack();
    const now = new Date();
    await accounts.insert({
      id: randomUUID(),
      email: 'known@example.com',
      passwordHash: await hasher.hash('right-password-1!'),
      role: 'user',
      status: 'active',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const unknown = await login
      .execute({
        email: 'missing@example.com',
        password: 'anything',
        deviceId: randomUUID(),
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    const wrong = await login
      .execute({
        email: 'known@example.com',
        password: 'wrong-password',
        deviceId: randomUUID(),
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    assert.ok(unknown instanceof DomainError);
    assert.ok(wrong instanceof DomainError);
    assert.equal(unknown.code, 'AUTH_INVALID');
    assert.equal(wrong.code, 'AUTH_INVALID');
    assert.equal(unknown.message, wrong.message);
    assert.equal(unknown.message, 'Invalid email or password');
  });

  it('rejects inactive accounts without issuing tokens', async () => {
    const { login, accounts, hasher } = await createLoginStack();
    const now = new Date();
    await accounts.insert({
      id: randomUUID(),
      email: 'suspended@example.com',
      passwordHash: await hasher.hash('password-1!'),
      role: 'user',
      status: 'suspended',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await assert.rejects(
      () =>
        login.execute({
          email: 'suspended@example.com',
          password: 'password-1!',
          deviceId: randomUUID(),
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'AUTH_ACCOUNT_INACTIVE',
    );
  });

  it('HTTP login route maps AUTH_INVALID to 401 uniformly', async () => {
    const { login, refreshSession, logout } = await createLoginStack();
    const [route] = createAuthRoutes({
      loginAccount: login,
      refreshAuthSession: refreshSession,
      logoutAccount: logout,
    });
    assert.ok(route);

    const catalog = ROUTE_CATALOG.find(
      (entry) => entry.method === route.method && entry.path === route.path,
    );
    assert.ok(catalog);
    assert.equal(catalog.operationId, 'login');

    const response = await route.handler({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: {},
      body: {
        email: 'nobody@example.com',
        password: 'nope',
        deviceId: randomUUID(),
      },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      error: 'Invalid email or password',
      code: 'AUTH_INVALID',
    });
  });
});
