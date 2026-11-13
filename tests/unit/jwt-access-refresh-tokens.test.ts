import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { IssueAuthTokenPair } from '../../src/application/auth/issue-auth-token-pair.js';
import { AuthTokenError } from '../../src/domain/auth/auth-token-error.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { OpaqueRefreshTokenService } from '../../src/infrastructure/crypto/opaque-refresh-token-service.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';

function makeKeys(activeKid = 'kid-1'): {
  readonly store: EnvJwtSigningKeyStore;
  readonly privatePem: string;
  readonly publicPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    privatePem: privateKey,
    publicPem: publicKey,
    store: new EnvJwtSigningKeyStore({
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
      activeKid,
    }),
  };
}

describe('BE-023 JWT access + refresh tokens', () => {
  it('issues RS256 access JWT with accountId, deviceId, roles, kid and 3600s TTL', () => {
    const { store } = makeKeys('kid-a');
    const ttl = loadJwtTokenTtlConfig({});
    const access = new NodeRs256AccessTokenService(store, ttl);

    const issued = access.issue({
      accountId: '11111111-1111-1111-1111-111111111111',
      deviceId: '22222222-2222-2222-2222-222222222222',
      roles: ['user'],
    });

    assert.equal(ttl.accessTokenTtlSeconds, 3600);
    assert.equal(issued.expiresInSeconds, 3600);
    assert.equal(issued.claims.kid, 'kid-a');
    assert.equal(issued.claims.roles[0], 'user');

    const [headerB64] = issued.token.split('.');
    const header = JSON.parse(
      Buffer.from(headerB64!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
        'utf8',
      ),
    ) as { alg: string; kid: string };
    assert.equal(header.alg, 'RS256');
    assert.equal(header.kid, 'kid-a');

    const verified = access.verify(issued.token);
    assert.equal(verified.accountId, issued.claims.accountId);
    assert.equal(verified.deviceId, issued.claims.deviceId);
    assert.equal(verified.jti, issued.claims.jti);
  });

  it('rejects forged access tokens and unknown kids', () => {
    const { store } = makeKeys('kid-a');
    const access = new NodeRs256AccessTokenService(store, loadJwtTokenTtlConfig({}));
    const issued = access.issue({
      accountId: 'a',
      deviceId: 'd',
      roles: ['user'],
    });

    assert.throws(
      () => access.verify(`${issued.token}x`),
      (error: unknown) =>
        error instanceof AuthTokenError && error.code === 'ACCESS_TOKEN_INVALID',
    );

    const other = makeKeys('kid-other');
    const otherAccess = new NodeRs256AccessTokenService(
      other.store,
      loadJwtTokenTtlConfig({}),
    );
    assert.throws(
      () => otherAccess.verify(issued.token),
      (error: unknown) =>
        error instanceof AuthTokenError &&
        error.code === 'ACCESS_TOKEN_KEY_UNKNOWN',
    );
  });

  it('rejects none / HS256 alg headers and wrong iss/aud (SEC-011)', () => {
    const { store } = makeKeys('kid-a');
    const ttl = loadJwtTokenTtlConfig({});
    const access = new NodeRs256AccessTokenService(store, ttl);
    const issued = access.issue({
      accountId: 'a',
      deviceId: 'd',
      roles: ['user'],
    });
    const [, payloadB64, sigB64] = issued.token.split('.') as [
      string,
      string,
      string,
    ];

    const noneHeader = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT', kid: 'kid-a' }),
      'utf8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    assert.throws(
      () => access.verify(`${noneHeader}.${payloadB64}.`),
      (error: unknown) =>
        error instanceof AuthTokenError && error.code === 'ACCESS_TOKEN_INVALID',
    );

    const hsHeader = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'kid-a' }),
      'utf8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    assert.throws(
      () => access.verify(`${hsHeader}.${payloadB64}.${sigB64}`),
      (error: unknown) =>
        error instanceof AuthTokenError && error.code === 'ACCESS_TOKEN_INVALID',
    );

    const wrongIssuer = new NodeRs256AccessTokenService(
      store,
      loadJwtTokenTtlConfig({ JWT_ISSUER: 'other-issuer' }),
    );
    assert.throws(
      () => wrongIssuer.verify(issued.token),
      (error: unknown) =>
        error instanceof AuthTokenError && error.code === 'ACCESS_TOKEN_INVALID',
    );

    const wrongAudience = new NodeRs256AccessTokenService(
      store,
      loadJwtTokenTtlConfig({ JWT_AUDIENCE: 'other-api' }),
    );
    assert.throws(
      () => wrongAudience.verify(issued.token),
      (error: unknown) =>
        error instanceof AuthTokenError && error.code === 'ACCESS_TOKEN_INVALID',
    );

    const [headerB64] = issued.token.split('.') as [string, ...string[]];
    const header = JSON.parse(
      Buffer.from(
        headerB64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8'),
    ) as { alg: string };
    assert.equal(header.alg, 'RS256');
    assert.equal(ttl.issuer, 'mi-iptv');
    assert.equal(ttl.audience, 'mi-iptv-api');
  });

  it('issues opaque refresh tokens bound to deviceId with 30-day TTL hash', () => {
    const refresh = new OpaqueRefreshTokenService(loadJwtTokenTtlConfig({}));
    const issued = refresh.issue({
      accountId: 'acct',
      deviceId: 'dev-1',
    });

    assert.equal(issued.deviceId, 'dev-1');
    assert.equal(issued.expiresInSeconds, 30 * 24 * 60 * 60);
    assert.equal(issued.tokenHash.byteLength, 32);
    assert.deepEqual(refresh.hash(issued.token), issued.tokenHash);
    assert.notEqual(issued.token, Buffer.from(issued.tokenHash).toString('base64url'));
  });

  it('IssueAuthTokenPair returns access expiresIn 3600 and refresh metadata', () => {
    const { store } = makeKeys();
    const ttl = loadJwtTokenTtlConfig({});
    const useCase = new IssueAuthTokenPair(
      new NodeRs256AccessTokenService(store, ttl),
      new OpaqueRefreshTokenService(ttl),
    );

    const pair = useCase.execute({
      accountId: 'acct',
      deviceId: 'dev',
      roles: ['user', 'support'],
    });

    assert.equal(pair.expiresIn, 3600);
    assert.equal(pair.deviceId, 'dev');
    assert.ok(pair.accessToken.split('.').length === 3);
    assert.ok(pair.refreshToken.length > 20);
    assert.equal(pair.refreshTokenHash.byteLength, 32);
  });

  it('verifies tokens after kid rotation using previous public keys', () => {
    const oldKeys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const newKeys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const oldStore = new EnvJwtSigningKeyStore({
      privateKeyPem: oldKeys.privateKey,
      publicKeyPem: oldKeys.publicKey,
      activeKid: 'kid-old',
    });
    const ttl = loadJwtTokenTtlConfig({});
    const oldAccess = new NodeRs256AccessTokenService(oldStore, ttl);
    const token = oldAccess.issue({
      accountId: 'acct',
      deviceId: 'dev',
      roles: ['user'],
    }).token;

    const rotated = new EnvJwtSigningKeyStore({
      privateKeyPem: newKeys.privateKey,
      publicKeyPem: newKeys.publicKey,
      activeKid: 'kid-new',
      previousPublicKeysJson: JSON.stringify({ 'kid-old': oldKeys.publicKey }),
    });
    const rotatedAccess = new NodeRs256AccessTokenService(rotated, ttl);
    const claims = rotatedAccess.verify(token);
    assert.equal(claims.kid, 'kid-old');
    assert.equal(rotated.listKids()[0], 'kid-new');
  });
});

describe('loadJwtTokenTtlConfig', () => {
  it('rejects access TTL outside 15–60 minutes', () => {
    assert.throws(() =>
      loadJwtTokenTtlConfig({ JWT_ACCESS_TTL_SECONDS: '60' }),
    );
    assert.throws(() =>
      loadJwtTokenTtlConfig({ JWT_ACCESS_TTL_SECONDS: '7200' }),
    );
  });

  it('bounds refresh TTL to 1–30 days (SEC-012)', () => {
    assert.equal(loadJwtTokenTtlConfig({}).refreshTokenTtlSeconds, 2_592_000);
    assert.throws(() =>
      loadJwtTokenTtlConfig({ JWT_REFRESH_TTL_SECONDS: '3600' }),
    );
    assert.throws(() =>
      loadJwtTokenTtlConfig({ JWT_REFRESH_TTL_SECONDS: '2592001' }),
    );
  });
});
