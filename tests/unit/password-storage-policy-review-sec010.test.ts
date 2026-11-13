import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ARGON2ID_PARAMS,
  loadPasswordHashParams,
} from '../../src/config/password-hashing.js';
import {
  PASSWORD_MIN_LENGTH,
  isPasswordPolicyCompliant,
} from '../../src/domain/auth/password-policy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('SEC-010 password storage and policy review', () => {
  const review = read('docs/security/010-password-storage-policy-review.md');
  const hasher = read('src/infrastructure/crypto/argon2-password-hasher.ts');
  const schema = read('db/migrations/001_postgres_schema.sql');
  const devSeed = read('db/seeds/dev/001_dev_smoke.sql');
  const qaSeed = read('db/seeds/qa/001_qa_contract.sql');
  const redact = read('src/infrastructure/logging/redact-log-fields.ts');

  it('uses Argon2id with floors meeting or exceeding OWASP (vs bcrypt cost ≥12)', () => {
    assert.equal(DEFAULT_ARGON2ID_PARAMS.algorithm, 'argon2id');
    assert.ok(DEFAULT_ARGON2ID_PARAMS.memoryKiB >= 19_456);
    assert.ok(DEFAULT_ARGON2ID_PARAMS.timeCost >= 2);
    assert.ok(DEFAULT_ARGON2ID_PARAMS.parallelism >= 1);
    assert.match(hasher, /Algorithm\.Argon2id/);
    assert.match(hasher, /assertPasswordMeetsPolicy/);
    assert.throws(
      () =>
        loadPasswordHashParams({
          PASSWORD_ARGON2_MEMORY_KIB: '19455',
        }),
      /PASSWORD_ARGON2_MEMORY_KIB/,
    );
    assert.match(review, /Argon2id/);
    assert.match(review, /bcrypt cost ≥ 12|bcrypt ≥ 12/i);
  });

  it('enforces Security §2.1 policy (≥8, digit, special)', () => {
    assert.equal(PASSWORD_MIN_LENGTH, 8);
    assert.equal(isPasswordPolicyCompliant('Valid12!'), true);
    assert.equal(isPasswordPolicyCompliant('short1!'), false);
    assert.equal(isPasswordPolicyCompliant('longenough'), false);
    assert.equal(isPasswordPolicyCompliant('longenough1'), false);
    assert.equal(isPasswordPolicyCompliant('longenough!'), false);
    assert.match(review, /≥8|≥ 8/);
  });

  it('stores only PHC hashes — no plaintext in schema or seeds', () => {
    assert.match(schema, /password_hash\s+text\s+NOT NULL/);
    assert.match(devSeed, /\$argon2id\$/);
    assert.match(qaSeed, /\$argon2id\$/);
    assert.doesNotMatch(devSeed, /password_hash,\s*\n\s*'[^$']/);
    assert.equal(devSeed.includes('plaintext'), false);
    assert.match(redact, /'password'/);
    assert.match(hasher, /never logged or stored/i);
    assert.match(review, /No plaintext/i);
  });
});
