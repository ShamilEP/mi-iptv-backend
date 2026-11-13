import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Argon2PasswordHasher } from '../../src/infrastructure/crypto/argon2-password-hasher.js';
import { loadPasswordHashParams } from '../../src/config/password-hashing.js';
import { PasswordPolicyError } from '../../src/domain/auth/password-policy.js';

/** Faster params for unit tests (still above OWASP floor). */
const testParams = loadPasswordHashParams({
  PASSWORD_ARGON2_MEMORY_KIB: '19456',
  PASSWORD_ARGON2_TIME_COST: '2',
  PASSWORD_ARGON2_PARALLELISM: '1',
});

describe('Argon2PasswordHasher', () => {
  it('hashes with Argon2id PHC and verifies the same password', async () => {
    const hasher = new Argon2PasswordHasher(testParams);
    const plain = 'Correct-Horse-Battery-1!';
    const passwordHash = await hasher.hash(plain);

    assert.match(passwordHash, /^\$argon2id\$/);
    assert.equal(await hasher.verify(plain, passwordHash), true);
    assert.equal(await hasher.verify('wrong-password', passwordHash), false);
  });

  it('does not embed the plaintext password in the PHC string', async () => {
    const hasher = new Argon2PasswordHasher(testParams);
    const plain = 'UniquePlaintext-9!';
    const passwordHash = await hasher.hash(plain);
    assert.equal(passwordHash.includes(plain), false);
  });

  it('rejects non-policy passwords before hashing (SEC-010)', async () => {
    const hasher = new Argon2PasswordHasher(testParams);
    await assert.rejects(
      () => hasher.hash('short1!'),
      (err: unknown) => err instanceof PasswordPolicyError,
    );
    await assert.rejects(
      () => hasher.hash('longenoughonly'),
      (err: unknown) => err instanceof PasswordPolicyError,
    );
  });

  it('returns false for malformed stored hashes', async () => {
    const hasher = new Argon2PasswordHasher(testParams);
    assert.equal(await hasher.verify('any-password', 'not-a-phc'), false);
  });
});
