import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { RegisterAccount } from '../../src/application/auth/register-account.js';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { GetProfile } from '../../src/application/profiles/get-profile.js';
import { UpdateProfile } from '../../src/application/profiles/update-profile.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { InMemoryAccountRepository } from '../../src/infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemoryRefreshTokenRepository } from '../../src/infrastructure/persistence/in-memory-refresh-token-repository.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { createProfilesRoutes } from '../../src/presentation/http/routes/profiles-routes.js';
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
  const getProfile = new GetProfile(access, profiles);
  const updateProfile = new UpdateProfile(access, profiles);
  return { register, getProfile, updateProfile, profiles };
}

describe('BE-035 profile endpoints', () => {
  it('gets and patches onboarding profile fields', async () => {
    const { register, getProfile, updateProfile } = await createStack();
    const session = await register.execute({
      email: 'profile@example.com',
      password: 'Profile-ok-1!',
      deviceId: randomUUID(),
    });

    const before = await getProfile.execute({
      accessToken: session.accessToken,
    });
    assert.equal(before.isDefault, true);
    assert.equal(before.language, 'es');
    assert.equal(before.autoplay, true);

    const updated = await updateProfile.execute({
      accessToken: session.accessToken,
      name: 'Salon',
      language: 'en',
      region: 'US',
      autoplay: false,
      subtitlePrefs: { enabled: true, language: 'en' },
      avatar: 'https://cdn.example/a.png',
    });
    assert.equal(updated.name, 'Salon');
    assert.equal(updated.language, 'en');
    assert.equal(updated.region, 'US');
    assert.equal(updated.autoplay, false);
    assert.deepEqual(updated.subtitlePrefs, {
      enabled: true,
      language: 'en',
    });
    assert.equal(updated.avatar, 'https://cdn.example/a.png');
    assert.equal(updated.isDefault, true);

    const again = await getProfile.execute({
      accessToken: session.accessToken,
    });
    assert.equal(again.name, 'Salon');
    assert.equal(again.autoplay, false);
  });

  it('rejects empty name and missing profile', async () => {
    const { register, updateProfile, getProfile, profiles } =
      await createStack();
    const session = await register.execute({
      email: 'patch@example.com',
      password: 'Profile-ok-2!',
      deviceId: randomUUID(),
    });

    await assert.rejects(
      () =>
        updateProfile.execute({
          accessToken: session.accessToken,
          name: '   ',
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PROFILE_INPUT_INVALID',
    );

    await profiles.deleteByAccount(session.accountId);
    await assert.rejects(
      () => getProfile.execute({ accessToken: session.accessToken }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PROFILE_NOT_FOUND',
    );
  });

  it('HTTP GET/PATCH routes are catalogued and require Bearer', async () => {
    const { register, getProfile, updateProfile } = await createStack();
    const routes = createProfilesRoutes({ getProfile, updateProfile });
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'getProfile'),
      true,
    );
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'updateProfile'),
      true,
    );

    const getRoute = routes.find((route) => route.method === 'GET');
    const patchRoute = routes.find((route) => route.method === 'PATCH');
    assert.ok(getRoute);
    assert.ok(patchRoute);

    const unauthorized = await getRoute.handler({
      method: 'GET',
      url: '/api/v1/profiles',
      headers: {},
    });
    assert.equal(unauthorized.statusCode, 401);

    const session = await register.execute({
      email: 'http-profile@example.com',
      password: 'Profile-ok-3!',
      deviceId: randomUUID(),
    });
    const got = await getRoute.handler({
      method: 'GET',
      url: '/api/v1/profiles',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(got.statusCode, 200);
    assert.equal((got.body as { language: string }).language, 'es');

    const patched = await patchRoute.handler({
      method: 'PATCH',
      url: '/api/v1/profiles',
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: { language: 'pt', autoplay: false },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal((patched.body as { language: string }).language, 'pt');
    assert.equal((patched.body as { autoplay: boolean }).autoplay, false);
  });
});
