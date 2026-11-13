import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { RegisterAccount } from '../../src/application/auth/register-account.js';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { CreateProfile } from '../../src/application/profiles/create-profile.js';
import { DeleteProfile } from '../../src/application/profiles/delete-profile.js';
import { GetProfile } from '../../src/application/profiles/get-profile.js';
import { ListProfiles } from '../../src/application/profiles/list-profiles.js';
import { UpdateProfile } from '../../src/application/profiles/update-profile.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { InMemoryAccountRepository } from '../../src/infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryFavoriteSyncRepository } from '../../src/infrastructure/persistence/in-memory-favorite-sync-repository.js';
import { InMemoryPlaybackSyncRepository } from '../../src/infrastructure/persistence/in-memory-playback-sync-repository.js';
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
  const favorites = new InMemoryFavoriteSyncRepository();
  const playback = new InMemoryPlaybackSyncRepository();
  const createDefaultProfile = new CreateDefaultProfile(profiles);
  const issuePair = new IssueAuthTokenPair(access, refresh);
  const register = new RegisterAccount(
    accounts,
    hasher,
    issuePair,
    refreshTokens,
    createDefaultProfile,
  );
  const listProfiles = new ListProfiles(access, profiles);
  const getProfile = new GetProfile(access, profiles);
  const createProfile = new CreateProfile(access, profiles);
  const updateProfile = new UpdateProfile(access, profiles);
  const deleteProfile = new DeleteProfile(
    access,
    profiles,
    favorites,
    playback,
  );
  return {
    register,
    listProfiles,
    getProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    profiles,
    favorites,
    playback,
  };
}

describe('BE-035 / BE-036 profile endpoints', () => {
  it('gets and patches onboarding profile fields by id', async () => {
    const { register, getProfile, updateProfile, listProfiles } =
      await createStack();
    const session = await register.execute({
      email: 'profile@example.com',
      password: 'Profile-ok-1!',
      deviceId: randomUUID(),
    });

    const listed = await listProfiles.execute({
      accessToken: session.accessToken,
    });
    assert.equal(listed.items.length, 1);
    const profileId = listed.items[0]!.id;

    const before = await getProfile.execute({
      accessToken: session.accessToken,
      profileId,
    });
    assert.equal(before.isDefault, true);
    assert.equal(before.language, 'es');

    const updated = await updateProfile.execute({
      accessToken: session.accessToken,
      profileId,
      name: 'Salon',
      language: 'en',
      region: 'US',
      autoplay: false,
      subtitlePrefs: { enabled: true, language: 'en' },
      avatar: 'https://cdn.example/a.png',
    });
    assert.equal(updated.name, 'Salon');
    assert.equal(updated.language, 'en');
    assert.equal(updated.autoplay, false);
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

  it('HTTP multi-profile routes are catalogued and require Bearer', async () => {
    const stack = await createStack();
    const routes = createProfilesRoutes(stack);
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'listProfiles'),
      true,
    );
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'createProfile'),
      true,
    );
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'deleteProfile'),
      true,
    );

    const listRoute = routes.find(
      (route) => route.method === 'GET' && route.path === '/api/v1/profiles',
    );
    assert.ok(listRoute);
    const unauthorized = await listRoute.handler({
      method: 'GET',
      url: '/api/v1/profiles',
      headers: {},
    });
    assert.equal(unauthorized.statusCode, 401);

    const session = await stack.register.execute({
      email: 'http-profile@example.com',
      password: 'Profile-ok-3!',
      deviceId: randomUUID(),
    });
    const listed = await listRoute.handler({
      method: 'GET',
      url: '/api/v1/profiles',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(listed.statusCode, 200);
    const items = (listed.body as { items: { id: string }[] }).items;
    assert.equal(items.length, 1);

    const patchRoute = routes.find(
      (route) =>
        route.method === 'PATCH' && route.path === '/api/v1/profiles/{id}',
    );
    assert.ok(patchRoute);
    const patched = await patchRoute.handler({
      method: 'PATCH',
      url: `/api/v1/profiles/${items[0]!.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      params: { id: items[0]!.id },
      body: { language: 'pt', autoplay: false },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal((patched.body as { language: string }).language, 'pt');
  });
});
