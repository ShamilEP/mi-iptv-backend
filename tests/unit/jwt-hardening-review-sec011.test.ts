import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import {
  REQUIRED_ACCESS_TOKEN_ALG,
  assertJwtAccessAlg,
  assertJwtAudience,
  assertJwtIssuer,
} from '../../src/domain/auth/access-token-rules.js';
import { AuthTokenError } from '../../src/domain/auth/auth-token-error.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('SEC-011 JWT hardening review', () => {
  const review = read('docs/security/011-jwt-hardening-review.md');
  const service = read('src/infrastructure/crypto/node-rs256-access-token-service.ts');
  const keyStore = read('src/infrastructure/secrets/env-jwt-signing-key-store.ts');
  const adr = read('docs/adr/004-jwt-ttl-and-signing.md');

  it('pins RS256 and rejects none / alg confusion', () => {
    assert.equal(REQUIRED_ACCESS_TOKEN_ALG, 'RS256');
    assert.throws(() => assertJwtAccessAlg('none'), AuthTokenError);
    assert.throws(() => assertJwtAccessAlg('HS256'), AuthTokenError);
    assert.match(service, /assertJwtAccessAlg/);
    assert.match(service, /RSA-SHA256/);
    assert.match(review, /none/);
    assert.match(adr, /RS256/);
  });

  it('validates iss, aud, and exp configuration', () => {
    const ttl = loadJwtTokenTtlConfig({});
    assert.equal(ttl.issuer, 'mi-iptv');
    assert.equal(ttl.audience, 'mi-iptv-api');
    assert.doesNotThrow(() => assertJwtIssuer(ttl.issuer, ttl.issuer));
    assert.doesNotThrow(() => assertJwtAudience(ttl.audience, ttl.audience));
    assert.match(service, /assertJwtIssuer/);
    assert.match(service, /assertJwtAudience/);
    assert.match(service, /aud:\s*this\.ttl\.audience/);
    assert.match(review, /iss.*aud.*exp/i);
  });

  it('rotates RS256 keys via kid per PRD-021 / ADR-004', () => {
    assert.match(keyStore, /JWT_PREVIOUS_PUBLIC_KEYS/);
    assert.match(keyStore, /activeKid/);
    assert.match(service, /getPublicKeyPem/);
    assert.match(review, /kid/);
    assert.match(adr, /kid/);
  });
});
