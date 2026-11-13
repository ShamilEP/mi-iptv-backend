import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCESS_TOKEN_TTL_DEFAULT_SECONDS,
  ACCESS_TOKEN_TTL_MAX_SECONDS,
  ACCESS_TOKEN_TTL_MIN_SECONDS,
  assertAccessTokenIssueInput,
  assertAccessTokenNotExpired,
  assertJwtAccessAlg,
  assertJwtKid,
  isAllowedAccessTokenTtlSeconds,
  parseAccessTokenClaims,
  REFRESH_TOKEN_TTL_DEFAULT_SECONDS,
  REQUIRED_ACCESS_TOKEN_ALG,
} from '../../src/domain/auth/access-token-rules.js';
import { AuthTokenError } from '../../src/domain/auth/auth-token-error.js';

describe('access token rules (BE-120 / Security §2.2)', () => {
  it('bounds access TTL to 15–60 minutes and defaults refresh to 30 days', () => {
    assert.equal(ACCESS_TOKEN_TTL_MIN_SECONDS, 900);
    assert.equal(ACCESS_TOKEN_TTL_MAX_SECONDS, 3600);
    assert.equal(ACCESS_TOKEN_TTL_DEFAULT_SECONDS, 3600);
    assert.equal(REFRESH_TOKEN_TTL_DEFAULT_SECONDS, 2_592_000);
    assert.equal(isAllowedAccessTokenTtlSeconds(900), true);
    assert.equal(isAllowedAccessTokenTtlSeconds(3600), true);
    assert.equal(isAllowedAccessTokenTtlSeconds(899), false);
    assert.equal(isAllowedAccessTokenTtlSeconds(3601), false);
    assert.equal(isAllowedAccessTokenTtlSeconds(900.5), false);
  });

  it('requires accountId, deviceId, and non-empty roles on issue', () => {
    assert.doesNotThrow(() =>
      assertAccessTokenIssueInput({
        accountId: 'acc',
        deviceId: 'dev',
        roles: ['user'],
      }),
    );
    assert.throws(
      () =>
        assertAccessTokenIssueInput({
          accountId: ' ',
          deviceId: 'dev',
          roles: ['user'],
        }),
      AuthTokenError,
    );
    assert.throws(
      () =>
        assertAccessTokenIssueInput({
          accountId: 'acc',
          deviceId: 'dev',
          roles: [],
        }),
      AuthTokenError,
    );
  });

  it('rejects non-RS256 algorithms including none / HS256', () => {
    assert.equal(REQUIRED_ACCESS_TOKEN_ALG, 'RS256');
    assert.doesNotThrow(() => assertJwtAccessAlg('RS256'));
    assert.throws(() => assertJwtAccessAlg('none'), AuthTokenError);
    assert.throws(() => assertJwtAccessAlg('HS256'), AuthTokenError);
    assert.throws(() => assertJwtAccessAlg(undefined), AuthTokenError);
  });

  it('requires kid and rejects expired tokens', () => {
    assert.equal(assertJwtKid('kid-1'), 'kid-1');
    assert.throws(() => assertJwtKid(''), AuthTokenError);
    assert.throws(() => assertJwtKid(undefined), AuthTokenError);
    assert.throws(
      () => assertAccessTokenNotExpired(100, 100),
      (error: unknown) =>
        error instanceof AuthTokenError && error.code === 'ACCESS_TOKEN_EXPIRED',
    );
    assert.doesNotThrow(() => assertAccessTokenNotExpired(101, 100));
  });

  it('parses complete claims and rejects incomplete or expired payloads', () => {
    const claims = parseAccessTokenClaims({
      accountId: 'acc-1',
      deviceId: 'dev-1',
      roles: ['user', 'support'],
      jti: 'jti-1',
      issuedAtUnix: 1_000,
      expiresAtUnix: 2_000,
      kid: 'kid-a',
      nowUnix: 1_500,
    });
    assert.deepEqual(claims, {
      accountId: 'acc-1',
      deviceId: 'dev-1',
      roles: ['user', 'support'],
      jti: 'jti-1',
      issuedAtUnix: 1_000,
      expiresAtUnix: 2_000,
      kid: 'kid-a',
    });

    assert.throws(
      () =>
        parseAccessTokenClaims({
          accountId: 'acc-1',
          deviceId: 'dev-1',
          roles: [],
          jti: 'jti-1',
          issuedAtUnix: 1_000,
          expiresAtUnix: 2_000,
          kid: 'kid-a',
          nowUnix: 1_500,
        }),
      AuthTokenError,
    );
    assert.throws(
      () =>
        parseAccessTokenClaims({
          accountId: 'acc-1',
          deviceId: 'dev-1',
          roles: ['user'],
          jti: 'jti-1',
          issuedAtUnix: 1_000,
          expiresAtUnix: 1_400,
          kid: 'kid-a',
          nowUnix: 1_500,
        }),
      (error: unknown) =>
        error instanceof AuthTokenError && error.code === 'ACCESS_TOKEN_EXPIRED',
    );
  });
});
