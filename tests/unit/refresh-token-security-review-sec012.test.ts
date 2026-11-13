import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import {
  REFRESH_TOKEN_TTL_DEFAULT_SECONDS,
  REFRESH_TOKEN_TTL_MAX_SECONDS,
  REFRESH_TOKEN_TTL_MIN_SECONDS,
} from '../../src/domain/auth/access-token-rules.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('SEC-012 refresh-token security review', () => {
  const review = read('docs/security/012-refresh-token-security-review.md');
  const opaque = read('src/infrastructure/crypto/opaque-refresh-token-service.ts');
  const refresh = read('src/application/auth/refresh-auth-session.ts');
  const logout = read('src/application/auth/logout-account.ts');
  const schema = read('db/migrations/001_postgres_schema.sql');
  const redact = read('src/infrastructure/logging/redact-log-fields.ts');

  it('hashes refresh tokens at rest (SHA-256 / token_hash)', () => {
    assert.match(opaque, /createHash\('sha256'\)/);
    assert.match(opaque, /never persisted|only `tokenHash` is persisted|SHA-256 hash for DB/i);
    assert.match(schema, /token_hash\s+bytea\s+NOT NULL UNIQUE/);
    assert.match(schema, /never stored/i);
    assert.match(redact, /refreshtoken/);
    assert.match(review, /Hashed at rest/i);
  });

  it('rotates with reuse detection and keeps device binding', () => {
    assert.match(refresh, /reuse_detected/);
    assert.match(refresh, /revokeFamily/);
    assert.match(refresh, /markRotated/);
    assert.match(refresh, /existing\.deviceId/);
    assert.match(opaque, /deviceId/);
    assert.match(review, /Device binding/i);
    assert.match(review, /reuse/i);
  });

  it('enforces 30-day max expiry and revoke-all', () => {
    assert.equal(REFRESH_TOKEN_TTL_MIN_SECONDS, 86_400);
    assert.equal(REFRESH_TOKEN_TTL_MAX_SECONDS, 2_592_000);
    assert.equal(REFRESH_TOKEN_TTL_DEFAULT_SECONDS, 2_592_000);
    assert.equal(
      loadJwtTokenTtlConfig({}).refreshTokenTtlSeconds,
      REFRESH_TOKEN_TTL_DEFAULT_SECONDS,
    );
    assert.match(logout, /revokeByAccount/);
    assert.match(logout, /allSessions/);
    assert.match(logout, /logout_all/);
    assert.match(review, /Revoke-all/i);
    assert.match(review, /30-day/i);
  });
});
