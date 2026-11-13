import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { AuthRateLimitError } from '../../src/application/auth/auth-rate-limit-error.js';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import {
  LOGIN_BRUTE_FORCE_MAX_FAILURES,
  LOGIN_BRUTE_FORCE_WINDOW_SECONDS,
  LoginBruteForceGuard,
} from '../../src/application/auth/login-brute-force-guard.js';
import {
  REGISTER_ABUSE_MAX_ATTEMPTS,
  REGISTER_ABUSE_WINDOW_SECONDS,
  RegisterAbuseGuard,
} from '../../src/application/auth/register-abuse-guard.js';
import { RegisterAccount } from '../../src/application/auth/register-account.js';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { InMemoryAccountRepository } from '../../src/infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemoryRefreshTokenRepository } from '../../src/infrastructure/persistence/in-memory-refresh-token-repository.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { LoginAccount } from '../../src/application/auth/login-account.js';
import { LogoutAccount } from '../../src/application/auth/logout-account.js';
import { RefreshAuthSession } from '../../src/application/auth/refresh-auth-session.js';
import { RedisAccessTokenDenyList } from '../../src/infrastructure/cache/redis-access-token-deny-list.js';
import { createAuthRoutes } from '../../src/presentation/http/routes/auth-routes.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const testHashParams = loadPasswordHashParams({
  PASSWORD_ARGON2_MEMORY_KIB: '19456',
  PASSWORD_ARGON2_TIME_COST: '2',
  PASSWORD_ARGON2_PARALLELISM: '1',
});

async function createRegisterWithGuard() {
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
  const profiles = new InMemoryProfileRepository();
  const redis = new InMemoryRedisClient();
  const abuseGuard = new RegisterAbuseGuard(redis);
  const issuePair = new IssueAuthTokenPair(access, refresh);
  const register = new RegisterAccount(
    accounts,
    hasher,
    issuePair,
    refreshTokens,
    new CreateDefaultProfile(profiles),
    abuseGuard,
  );
  const login = new LoginAccount(accounts, hasher, issuePair, refreshTokens);
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
  return { register, login, refreshSession, logout, accounts, redis };
}

describe('SEC-013 login and registration abuse controls', () => {
  it('documents Security §4.1 ceilings and US-01 throttling', () => {
    const review = readFileSync(
      join(root, 'docs/security/013-login-register-abuse-controls.md'),
      'utf8',
    );
    assert.match(review, /5 attempts \/ 15 minutes/i);
    assert.match(review, /AUTH_EMAIL_CONFLICT/);
    assert.match(review, /rl:register:ip:/);
    assert.match(review, /rl:login:ip:/);
    assert.equal(LOGIN_BRUTE_FORCE_MAX_FAILURES, 5);
    assert.equal(LOGIN_BRUTE_FORCE_WINDOW_SECONDS, 900);
    assert.equal(REGISTER_ABUSE_MAX_ATTEMPTS, 5);
    assert.equal(REGISTER_ABUSE_WINDOW_SECONDS, 900);
  });

  it('keeps login lockout at 5 failures / 15 min per IP and account', async () => {
    const redis = new InMemoryRedisClient();
    const guard = new LoginBruteForceGuard(redis);
    const email = 'lock@example.com';
    const ip = '203.0.113.10';

    for (let i = 0; i < LOGIN_BRUTE_FORCE_MAX_FAILURES; i += 1) {
      await guard.assertAllowed(ip, email);
      await guard.recordFailure(ip, email);
    }

    await assert.rejects(
      () => guard.assertAllowed(ip, email),
      (error: unknown) =>
        error instanceof AuthRateLimitError &&
        error.code === 'AUTH_RATE_LIMITED',
    );

    const emailHash = createHash('sha256').update(email).digest('hex');
    assert.equal(
      await redis.get(`rl:login:acct:${emailHash}`),
      String(LOGIN_BRUTE_FORCE_MAX_FAILURES),
    );
  });

  it('rate-limits register after 5 attempts including email conflicts', async () => {
    const { register } = await createRegisterWithGuard();
    const email = 'taken@example.com';
    const password = 'Register-limit-1!';
    const ip = '198.51.100.20';

    await register.execute({
      email,
      password,
      deviceId: randomUUID(),
      clientIp: ip,
    });

    for (let i = 0; i < REGISTER_ABUSE_MAX_ATTEMPTS - 1; i += 1) {
      await assert.rejects(
        () =>
          register.execute({
            email,
            password,
            deviceId: randomUUID(),
            clientIp: ip,
          }),
        (error: unknown) =>
          error instanceof DomainError && error.code === 'AUTH_EMAIL_CONFLICT',
      );
    }

    await assert.rejects(
      () =>
        register.execute({
          email,
          password,
          deviceId: randomUUID(),
          clientIp: ip,
        }),
      (error: unknown) =>
        error instanceof AuthRateLimitError &&
        error.code === 'AUTH_RATE_LIMITED',
    );
  });

  it('HTTP register maps rate limit to 429 with Retry-After', async () => {
    const { register, login, refreshSession, logout } =
      await createRegisterWithGuard();
    const routes = createAuthRoutes({
      registerAccount: register,
      loginAccount: login,
      refreshAuthSession: refreshSession,
      logoutAccount: logout,
    });
    const registerRoute = routes.find(
      (route) => route.path === '/api/v1/auth/register',
    );
    assert.ok(registerRoute);

    const email = 'http-limit-reg@example.com';
    const password = 'Http-reg-limit-1!';
    const clientIp = '192.0.2.77';

    for (let i = 0; i < REGISTER_ABUSE_MAX_ATTEMPTS; i += 1) {
      const response = await registerRoute.handler({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: {},
        clientIp,
        body: {
          email,
          password,
          deviceId: randomUUID(),
        },
      });
      assert.ok(
        response.statusCode === 201 || response.statusCode === 409,
        `expected 201/409, got ${response.statusCode}`,
      );
    }

    const locked = await registerRoute.handler({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {},
      clientIp,
      body: {
        email,
        password,
        deviceId: randomUUID(),
      },
    });
    assert.equal(locked.statusCode, 429);
    assert.equal(
      (locked.body as { code: string }).code,
      'AUTH_RATE_LIMITED',
    );
    assert.ok(locked.headers?.['retry-after']);
  });
});
