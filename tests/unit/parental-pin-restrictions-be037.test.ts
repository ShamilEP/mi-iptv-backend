import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { RegisterAccount } from '../../src/application/auth/register-account.js';
import { CreateDefaultProfile } from '../../src/application/profiles/create-default-profile.js';
import { CreateProfile } from '../../src/application/profiles/create-profile.js';
import { EvaluateContentForProfile } from '../../src/application/profiles/evaluate-content-for-profile.js';
import { ListProfiles } from '../../src/application/profiles/list-profiles.js';
import {
  PARENTAL_PIN_MAX_FAILURES,
  ParentalPinThrottle,
} from '../../src/application/profiles/parental-pin-throttle.js';
import { SetParentalPin } from '../../src/application/profiles/set-parental-pin.js';
import { UpdateProfileRestrictions } from '../../src/application/profiles/update-profile-restrictions.js';
import { VerifyParentalPin } from '../../src/application/profiles/verify-parental-pin.js';
import { AuthRateLimitError } from '../../src/application/auth/auth-rate-limit-error.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { evaluateContentAccess } from '../../src/domain/profiles/parental-restrictions.js';
import { DomainError } from '../../src/domain/shared/domain-error.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { InMemoryAccountRepository } from '../../src/infrastructure/persistence/in-memory-account-repository.js';
import { InMemoryProfileRepository } from '../../src/infrastructure/persistence/in-memory-profile-repository.js';
import { InMemoryRefreshTokenRepository } from '../../src/infrastructure/persistence/in-memory-refresh-token-repository.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { createProfilesParentalRoutes } from '../../src/presentation/http/routes/profiles-parental-routes.js';
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
  const hasher = new Argon2PasswordHasher(testHashParams);
  const profiles = new InMemoryProfileRepository();
  const redis = new InMemoryRedisClient();
  const register = new RegisterAccount(
    new InMemoryAccountRepository(),
    hasher,
    new IssueAuthTokenPair(access, new OpaqueRefreshTokenService(ttl)),
    new InMemoryRefreshTokenRepository(),
    new CreateDefaultProfile(profiles),
  );
  const throttle = new ParentalPinThrottle(redis);
  return {
    register,
    profiles,
    listProfiles: new ListProfiles(access, profiles),
    createProfile: new CreateProfile(access, profiles),
    setPin: new SetParentalPin(access, profiles, hasher),
    verifyPin: new VerifyParentalPin(access, profiles, hasher, throttle),
    updateRestrictions: new UpdateProfileRestrictions(access, profiles),
    evaluate: new EvaluateContentForProfile(profiles),
    throttle,
  };
}

describe('BE-037 parental PIN and content restrictions', () => {
  it('stores PIN hashed and never exposes hash or clear PIN', async () => {
    const api = await createStack();
    const session = await api.register.execute({
      email: 'pin@example.com',
      password: 'Parental-ok-1!',
      deviceId: randomUUID(),
    });
    const kids = await api.createProfile.execute({
      accessToken: session.accessToken,
      name: 'Kids',
    });

    const updated = await api.setPin.execute({
      accessToken: session.accessToken,
      profileId: kids.id,
      pin: '1234',
    });
    assert.equal(updated.pinConfigured, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(updated, 'pinHash'),
      false,
    );

    const stored = await api.profiles.findById(session.accountId, kids.id);
    assert.ok(stored?.pinHash);
    assert.notEqual(stored?.pinHash, '1234');
    assert.match(stored!.pinHash!, /^\$argon2id\$/);

    const verified = await api.verifyPin.execute({
      accessToken: session.accessToken,
      profileId: kids.id,
      pin: '1234',
    });
    assert.equal(verified.verified, true);

    await assert.rejects(
      () =>
        api.verifyPin.execute({
          accessToken: session.accessToken,
          profileId: kids.id,
          pin: '9999',
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === 'PARENTAL_PIN_INVALID',
    );
  });

  it('throttles parental PIN verification after repeated failures', async () => {
    const api = await createStack();
    const session = await api.register.execute({
      email: 'throttle@example.com',
      password: 'Parental-ok-2!',
      deviceId: randomUUID(),
    });
    const listed = await api.listProfiles.execute({
      accessToken: session.accessToken,
    });
    const profileId = listed.items[0]!.id;
    await api.setPin.execute({
      accessToken: session.accessToken,
      profileId,
      pin: '4321',
    });

    for (let i = 0; i < PARENTAL_PIN_MAX_FAILURES; i += 1) {
      await assert.rejects(
        () =>
          api.verifyPin.execute({
            accessToken: session.accessToken,
            profileId,
            pin: '0000',
          }),
        DomainError,
      );
    }
    await assert.rejects(
      () =>
        api.verifyPin.execute({
          accessToken: session.accessToken,
          profileId,
          pin: '4321',
        }),
      AuthRateLimitError,
    );
  });

  it('restricts content by rating or source when metadata exists', async () => {
    const kidRestrictions = {
      kidMode: true,
      maxRating: 'PG',
      allowedSourceIds: ['src-kids'],
      blockedSourceIds: ['src-adult'],
    };

    assert.equal(
      evaluateContentAccess(kidRestrictions, { rating: 'R' }).allowed,
      false,
    );
    assert.equal(
      evaluateContentAccess(kidRestrictions, { rating: 'G' }).allowed,
      true,
    );
    assert.equal(
      evaluateContentAccess(kidRestrictions, {}).allowed,
      true,
    );
    assert.equal(
      evaluateContentAccess(kidRestrictions, { sourceId: 'src-adult' }).allowed,
      false,
    );
    assert.equal(
      evaluateContentAccess(kidRestrictions, { sourceId: 'src-other' }).allowed,
      false,
    );
    assert.equal(
      evaluateContentAccess(kidRestrictions, { sourceId: 'src-kids' }).allowed,
      true,
    );

    const api = await createStack();
    const session = await api.register.execute({
      email: 'restrict@example.com',
      password: 'Parental-ok-3!',
      deviceId: randomUUID(),
    });
    const profileId = (
      await api.listProfiles.execute({ accessToken: session.accessToken })
    ).items[0]!.id;

    await api.updateRestrictions.execute({
      accessToken: session.accessToken,
      profileId,
      kidMode: true,
      maxRating: 'PG',
      allowedSourceIds: ['src-kids'],
      blockedSourceIds: ['src-adult'],
    });

    const blocked = await api.evaluate.execute({
      accountId: session.accountId,
      profileId,
      content: { rating: 'TV-MA', sourceId: 'src-kids' },
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'RATING_EXCEEDED');

    const allowed = await api.evaluate.execute({
      accountId: session.accountId,
      profileId,
      content: { rating: 'G', sourceId: 'src-kids' },
    });
    assert.equal(allowed.allowed, true);
  });

  it('catalogues parental pin routes and maps verify HTTP contract', async () => {
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'verifyParentalPin'),
      true,
    );
    assert.equal(
      ROUTE_CATALOG.some((entry) => entry.operationId === 'setParentalPin'),
      true,
    );

    const api = await createStack();
    const routes = createProfilesParentalRoutes({
      setParentalPin: api.setPin,
      verifyParentalPin: api.verifyPin,
      updateProfileRestrictions: api.updateRestrictions,
    });
    const session = await api.register.execute({
      email: 'http-pin@example.com',
      password: 'Parental-ok-4!',
      deviceId: randomUUID(),
    });
    const profileId = (
      await api.listProfiles.execute({ accessToken: session.accessToken })
    ).items[0]!.id;

    const setRoute = routes.find(
      (route) => route.method === 'PUT' && route.path.endsWith('/pin'),
    );
    assert.ok(setRoute);
    const setResponse = await setRoute.handler({
      method: 'PUT',
      url: `/api/v1/profiles/${profileId}/pin`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      params: { id: profileId },
      body: { pin: '2468' },
    });
    assert.equal(setResponse.statusCode, 200);
    assert.equal(
      (setResponse.body as { pinConfigured: boolean }).pinConfigured,
      true,
    );

    const verifyRoute = routes.find(
      (route) => route.method === 'POST' && route.path.endsWith('/verify-pin'),
    );
    assert.ok(verifyRoute);
    const verifyResponse = await verifyRoute.handler({
      method: 'POST',
      url: `/api/v1/profiles/${profileId}/verify-pin`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      params: { id: profileId },
      body: { pin: '2468' },
    });
    assert.equal(verifyResponse.statusCode, 200);
  });
});
