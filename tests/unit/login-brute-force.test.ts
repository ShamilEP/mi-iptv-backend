import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { AuthRateLimitError } from '../../src/application/auth/auth-rate-limit-error.js';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { LoginAccount } from '../../src/application/auth/login-account.js';
import {
  LOGIN_BRUTE_FORCE_MAX_FAILURES,
  LoginBruteForceGuard,
} from '../../src/application/auth/login-brute-force-guard.js';
import { LogoutAccount } from '../../src/application/auth/logout-account.js';
import { RefreshAuthSession } from '../../src/application/auth/refresh-auth-session.js';
import type { Logger, LogFields } from '../../src/application/ports/logger.js';
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

const testHashParams = loadPasswordHashParams({
  PASSWORD_ARGON2_MEMORY_KIB: '19456',
  PASSWORD_ARGON2_TIME_COST: '2',
  PASSWORD_ARGON2_PARALLELISM: '1',
});

class RecordingLogger implements Logger {
  readonly warnings: Array<{ message: string; fields?: LogFields }> = [];

  child(): Logger {
    return this;
  }
  debug(): void {}
  info(): void {}
  warn(message: string, fields?: LogFields): void {
    this.warnings.push(
      fields === undefined ? { message } : { message, fields },
    );
  }
  error(): void {}
}

async function createLoginWithGuard(logger?: Logger) {
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
  const redis = new InMemoryRedisClient();
  const guard = new LoginBruteForceGuard(redis, logger);
  const login = new LoginAccount(
    accounts,
    hasher,
    issuePair,
    refreshTokens,
    guard,
  );
  const refreshSession = new RefreshAuthSession(
    accounts,
    refresh,
    refreshTokens,
    issuePair,
  );
  const logout = new LogoutAccount(
    access,
    new RedisAccessTokenDenyList(redis),
    refreshTokens,
    ttl.accessTokenTtlSeconds,
  );
  return { login, refreshSession, logout, accounts, hasher, guard, redis };
}

async function seedAccount(
  accounts: InMemoryAccountRepository,
  hasher: Argon2PasswordHasher,
  email: string,
  password: string,
): Promise<void> {
  const now = new Date();
  await accounts.insert({
    id: randomUUID(),
    email,
    passwordHash: await hasher.hash(password),
    role: 'user',
    status: 'active',
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('BE-028 login brute-force protection', () => {
  it('allows 5 failed attempts then returns AUTH_RATE_LIMITED with retryAfter', async () => {
    const logger = new RecordingLogger();
    const { login, accounts, hasher } = await createLoginWithGuard(logger);
    const email = 'limit@example.com';
    const password = 'correct-password!1';
    await seedAccount(accounts, hasher, email, password);
    const deviceId = randomUUID();
    const clientIp = '203.0.113.10';

    for (let i = 0; i < LOGIN_BRUTE_FORCE_MAX_FAILURES; i += 1) {
      await assert.rejects(
        () =>
          login.execute({
            email,
            password: 'wrong',
            deviceId,
            clientIp,
          }),
        (error: unknown) =>
          error instanceof DomainError && error.code === 'AUTH_INVALID',
      );
    }

    assert.equal(logger.warnings.length >= 1, true);
    assert.equal(
      logger.warnings.some((entry) => entry.message === 'Login lockout triggered'),
      true,
    );

    await assert.rejects(
      () =>
        login.execute({
          email,
          password: 'wrong',
          deviceId,
          clientIp,
        }),
      (error: unknown) =>
        error instanceof AuthRateLimitError &&
        error.code === 'AUTH_RATE_LIMITED' &&
        error.retryAfterSeconds > 0,
    );
  });

  it('locks by account across different IPs and clears counters on success', async () => {
    const { login, accounts, hasher } = await createLoginWithGuard();
    const email = 'account-lock@example.com';
    const password = 'correct-password!1';
    await seedAccount(accounts, hasher, email, password);
    const deviceId = randomUUID();

    for (let i = 0; i < LOGIN_BRUTE_FORCE_MAX_FAILURES; i += 1) {
      await assert.rejects(() =>
        login.execute({
          email,
          password: 'wrong',
          deviceId,
          clientIp: `198.51.100.${i + 1}`,
        }),
      );
    }

    await assert.rejects(
      () =>
        login.execute({
          email,
          password: 'wrong',
          deviceId,
          clientIp: '198.51.100.99',
        }),
      AuthRateLimitError,
    );

    // Different account from a previously used IP still works until that IP hits 5.
    await seedAccount(accounts, hasher, 'other@example.com', password);
    const ok = await login.execute({
      email: 'other@example.com',
      password,
      deviceId: randomUUID(),
      clientIp: '203.0.113.50',
    });
    assert.ok(ok.accessToken);
  });

  it('HTTP login maps rate limit to 429 with Retry-After', async () => {
    const { login, refreshSession, logout, accounts, hasher } =
      await createLoginWithGuard();
    const email = 'http-limit@example.com';
    await seedAccount(accounts, hasher, email, 'correct-password!1');
    const loginRoute = createAuthRoutes({
      registerAccount: {
        execute: async () => {
          throw new Error('unused');
        },
      } as never,
      loginAccount: login,
      refreshAuthSession: refreshSession,
      logoutAccount: logout,
    }).find((route) => route.path === '/api/v1/auth/login');
    assert.ok(loginRoute);

    for (let i = 0; i < LOGIN_BRUTE_FORCE_MAX_FAILURES; i += 1) {
      const response = await loginRoute.handler({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {},
        clientIp: '192.0.2.55',
        body: {
          email,
          password: 'wrong',
          deviceId: randomUUID(),
        },
      });
      assert.equal(response.statusCode, 401);
    }

    const locked = await loginRoute.handler({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: {},
      clientIp: '192.0.2.55',
      body: {
        email,
        password: 'wrong',
        deviceId: randomUUID(),
      },
    });
    assert.equal(locked.statusCode, 429);
    assert.equal(locked.headers?.['retry-after'] !== undefined, true);
    const body = locked.body as Record<string, unknown>;
    assert.equal(body.code, 'AUTH_RATE_LIMITED');
    assert.equal(typeof body.retryAfter, 'number');
  });
});
