import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { RegisterAccount } from '../../src/application/auth/register-account.js';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { CreateProfile } from '../../src/application/profiles/create-profile.js';
import { DeleteProfile } from '../../src/application/profiles/delete-profile.js';
import { ListProfiles } from '../../src/application/profiles/list-profiles.js';
import { UpdateProfile } from '../../src/application/profiles/update-profile.js';
import { ListFavorites } from '../../src/application/sync/list-favorites.js';
import { ListPlaybackHistory } from '../../src/application/sync/list-playback-history.js';
import { SetFavorite } from '../../src/application/sync/set-favorite.js';
import { UpsertPlaybackState } from '../../src/application/sync/upsert-playback-state.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { MAX_PROFILES_PER_ACCOUNT } from '../../src/domain/profiles/profile-limits.js';
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
  const favorites = new InMemoryFavoriteSyncRepository();
  const playback = new InMemoryPlaybackSyncRepository();
  const register = new RegisterAccount(
    new InMemoryAccountRepository(),
    hasher,
    new IssueAuthTokenPair(access, refresh),
    new InMemoryRefreshTokenRepository(),
    new CreateDefaultProfile(profiles),
  );
  return {
    access,
    register,
    profiles,
    favorites,
    playback,
    listProfiles: new ListProfiles(access, profiles),
    createProfile: new CreateProfile(access, profiles),
    updateProfile: new UpdateProfile(access, profiles),
    deleteProfile: new DeleteProfile(access, profiles, favorites, playback),
    listFavorites: new ListFavorites(favorites, profiles),
    setFavorite: new SetFavorite(favorites, profiles),
    upsertPlayback: new UpsertPlaybackState(playback, profiles),
    listHistory: new ListPlaybackHistory(playback, profiles),
  };
}

describe('BE-036 multi-profile management', () => {
  it('supports CRUD for several profiles with a household limit', async () => {
    const api = await createStack();
    const session = await api.register.execute({
      email: 'multi@example.com',
      password: 'Multi-ok-1!',
      deviceId: randomUUID(),
    });

    const kids = await api.createProfile.execute({
      accessToken: session.accessToken,
      name: 'Kids',
      language: 'en',
    });
    assert.equal(kids.isDefault, false);

    const listed = await api.listProfiles.execute({
      accessToken: session.accessToken,
    });
    assert.equal(listed.items.length, 2);

    for (let i = listed.items.length; i < MAX_PROFILES_PER_ACCOUNT; i += 1) {
      await api.createProfile.execute({
        accessToken: session.accessToken,
        name: `P${i}`,
      });
    }
    await assert.rejects(
      () =>
        api.createProfile.execute({
          accessToken: session.accessToken,
          name: 'Overflow',
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PROFILE_LIMIT_REACHED',
    );

    const promoted = await api.updateProfile.execute({
      accessToken: session.accessToken,
      profileId: kids.id,
      isDefault: true,
    });
    assert.equal(promoted.isDefault, true);
    const afterPromote = await api.listProfiles.execute({
      accessToken: session.accessToken,
    });
    assert.equal(
      afterPromote.items.filter((row) => row.isDefault).length,
      1,
    );

    await api.deleteProfile.execute({
      accessToken: session.accessToken,
      profileId: kids.id,
    });
    const afterDelete = await api.listProfiles.execute({
      accessToken: session.accessToken,
    });
    assert.equal(afterDelete.items.length, MAX_PROFILES_PER_ACCOUNT - 1);
    assert.equal(afterDelete.items.some((row) => row.id === kids.id), false);
    assert.equal(afterDelete.items.filter((row) => row.isDefault).length, 1);
  });

  it('scopes favorites, progress, and history by profile', async () => {
    const api = await createStack();
    const session = await api.register.execute({
      email: 'scope@example.com',
      password: 'Multi-ok-2!',
      deviceId: randomUUID(),
    });
    const listed = await api.listProfiles.execute({
      accessToken: session.accessToken,
    });
    const defaultId = listed.items[0]!.id;
    const secondary = await api.createProfile.execute({
      accessToken: session.accessToken,
      name: 'Secondary',
    });
    const deviceId = randomUUID();
    const itemA = randomUUID();
    const contentA = randomUUID();

    await api.setFavorite.execute({
      accountId: session.accountId,
      profileId: defaultId,
      deviceId,
      clientEventId: randomUUID(),
      itemId: itemA,
      action: 'add',
      syncVersion: 0,
      type: 'channel',
    });
    await api.upsertPlayback.execute({
      accountId: session.accountId,
      profileId: defaultId,
      deviceId,
      clientEventId: randomUUID(),
      contentId: contentA,
      position: 90,
      completed: false,
      syncVersion: 0,
      duration: 1000,
    });

    const favoritesDefault = await api.listFavorites.execute(
      session.accountId,
      defaultId,
    );
    const favoritesSecondary = await api.listFavorites.execute(
      session.accountId,
      secondary.id,
    );
    assert.equal(favoritesDefault.length, 1);
    assert.equal(favoritesSecondary.length, 0);

    const historyDefault = await api.listHistory.execute(
      session.accountId,
      defaultId,
    );
    const historySecondary = await api.listHistory.execute(
      session.accountId,
      secondary.id,
    );
    assert.equal(historyDefault.items.length, 1);
    assert.equal(historyDefault.items[0]?.contentId, contentA);
    assert.equal(historySecondary.items.length, 0);

    await assert.rejects(
      () =>
        api.listFavorites.execute(session.accountId, randomUUID()),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PROFILE_NOT_FOUND',
    );

    await api.deleteProfile.execute({
      accessToken: session.accessToken,
      profileId: defaultId,
    });
    assert.equal(
      (await api.listFavorites.execute(session.accountId, secondary.id)).length,
      0,
    );
    assert.equal(
      (
        await api.favorites.listFavorites(session.accountId, defaultId)
      ).length,
      0,
    );
    assert.equal(
      (
        await api.playback.listPlaybackByProfile(session.accountId, defaultId)
      ).length,
      0,
    );
  });

  it('refuses deleting the last remaining profile', async () => {
    const api = await createStack();
    const session = await api.register.execute({
      email: 'last@example.com',
      password: 'Multi-ok-3!',
      deviceId: randomUUID(),
    });
    const only = (
      await api.listProfiles.execute({ accessToken: session.accessToken })
    ).items[0]!;
    await assert.rejects(
      () =>
        api.deleteProfile.execute({
          accessToken: session.accessToken,
          profileId: only.id,
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'PROFILE_LAST_REMAINING',
    );
  });
});
