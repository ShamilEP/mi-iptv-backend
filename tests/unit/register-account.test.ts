import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { LoginAccount } from '../../src/application/auth/login-account.js';
import { LogoutAccount } from '../../src/application/auth/logout-account.js';
import { RefreshAuthSession } from '../../src/application/auth/refresh-auth-session.js';
import { RegisterAccount } from '../../src/application/auth/register-account.js';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import {
  DEFAULT_PROFILE_AUTOPLAY,
  DEFAULT_PROFILE_LANGUAGE,
} from '../../src/domain/profiles/default-profile.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { PasswordPolicyError } from '../../src/domain/auth/password-policy.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { RedisAccessTokenDenyList } from '../../src/infrastructure/cache/redis-access-token-deny-list.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { InMemoryAccountRepository } from '../../src/infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemoryRefreshTokenRepository } from '../../src/infrastructure/persistence/in-memory-refresh-token-repository.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { createAuthRoutes } from '../../src/presentation/http/routes/auth-routes.js';
import { ROUTE_CATALOG } from '../../src/presentation/http/route-catalog.js';

const testHashParams = loadPasswordHashParams({
  PASSWORD_ARGON2_MEMORY_KIB: '19456',
  PASSWORD_ARGON2_TIME_COST: '2',
  PASSWORD_ARGON2_PARALLELISM: '1',
});

async function createRegisterStack() {
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
  const createDefaultProfile = new CreateDefaultProfile(profiles);
  const issuePair = new IssueAuthTokenPair(access, refresh);
  const register = new RegisterAccount(
    accounts,
    hasher,
    issuePair,
    refreshTokens,
    createDefaultProfile,
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
    new RedisAccessTokenDenyList(new InMemoryRedisClient()),
    refreshTokens,
    ttl.accessTokenTtlSeconds,
  );
  return {
    register,
    login,
    refreshSession,
    logout,
    accounts,
    profiles,
    access,
  };
}

describe('BE-020 RegisterAccount', () => {
  it('creates account, seeds default profile, and returns 201 tokens', async () => {
    const { register, profiles, access, login } = await createRegisterStack();
    const deviceId = randomUUID();
    const email = 'New.User@Example.com';
    const password = 'Register-ok-1!';

    const result = await register.execute({
      email,
      password,
      deviceId,
    });

    assert.equal(typeof result.accountId, 'string');
    assert.equal(result.expiresIn, 3600);
    const claims = access.verify(result.accessToken);
    assert.equal(claims.accountId, result.accountId);
    assert.equal(claims.deviceId, deviceId);

    const seeded = await profiles.listByAccount(result.accountId);
    assert.equal(seeded.length, 1);
    assert.equal(seeded[0]?.isDefault, true);
    assert.equal(seeded[0]?.language, DEFAULT_PROFILE_LANGUAGE);
    assert.equal(seeded[0]?.autoplay, DEFAULT_PROFILE_AUTOPLAY);

    const loggedIn = await login.execute({
      email,
      password,
      deviceId: randomUUID(),
    });
    assert.equal(loggedIn.accountId, result.accountId);
  });

  it('rejects duplicate email with AUTH_EMAIL_CONFLICT', async () => {
    const { register } = await createRegisterStack();
    const input = {
      email: 'dup@example.com',
      password: 'Dup-account-1!',
      deviceId: randomUUID(),
    };
    await register.execute(input);
    await assert.rejects(
      () => register.execute({ ...input, deviceId: randomUUID() }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'AUTH_EMAIL_CONFLICT',
    );
  });

  it('rejects weak passwords and invalid emails', async () => {
    const { register } = await createRegisterStack();
    await assert.rejects(
      () =>
        register.execute({
          email: 'not-an-email',
          password: 'Valid-pass-1!',
          deviceId: randomUUID(),
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'AUTH_EMAIL_INVALID',
    );
    await assert.rejects(
      () =>
        register.execute({
          email: 'ok@example.com',
          password: 'short1!',
          deviceId: randomUUID(),
        }),
      (error: unknown) => error instanceof PasswordPolicyError,
    );
  });

  it('HTTP register route returns 201 and maps conflict to 409', async () => {
    const { register, login, refreshSession, logout } =
      await createRegisterStack();
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
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'register'),
      true,
    );

    const created = await registerRoute.handler({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {},
      body: {
        email: 'http-reg@example.com',
        password: 'Http-register-1!',
        deviceId: randomUUID(),
      },
    });
    assert.equal(created.statusCode, 201);
    const body = created.body as {
      accountId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
    assert.equal(typeof body.accountId, 'string');
    assert.equal(typeof body.accessToken, 'string');
    assert.equal(typeof body.refreshToken, 'string');

    const conflict = await registerRoute.handler({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {},
      body: {
        email: 'http-reg@example.com',
        password: 'Http-register-1!',
        deviceId: randomUUID(),
      },
    });
    assert.equal(conflict.statusCode, 409);
    assert.deepEqual(conflict.body, {
      error: 'An account with this email already exists',
      code: 'AUTH_EMAIL_CONFLICT',
    });
  });
});
