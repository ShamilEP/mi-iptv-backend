import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ARGON2ID_PARAMS,
  loadPasswordHashParams,
} from '../../src/config/password-hashing.js';

describe('loadPasswordHashParams', () => {
  it('returns OWASP-aligned defaults when env is unset', () => {
    const params = loadPasswordHashParams({});
    assert.deepEqual(params, DEFAULT_ARGON2ID_PARAMS);
    assert.equal(params.algorithm, 'argon2id');
  });

  it('reads configurable cost parameters from env names', () => {
    const params = loadPasswordHashParams({
      PASSWORD_ARGON2_MEMORY_KIB: '19456',
      PASSWORD_ARGON2_TIME_COST: '2',
      PASSWORD_ARGON2_PARALLELISM: '4',
    });
    assert.deepEqual(params, {
      algorithm: 'argon2id',
      memoryKiB: 19_456,
      timeCost: 2,
      parallelism: 4,
    });
  });

  it('rejects memory below OWASP floor', () => {
    assert.throws(
      () =>
        loadPasswordHashParams({
          PASSWORD_ARGON2_MEMORY_KIB: '1024',
        }),
      /PASSWORD_ARGON2_MEMORY_KIB/,
    );
  });

  it('rejects invalid numeric strings', () => {
    assert.throws(
      () =>
        loadPasswordHashParams({
          PASSWORD_ARGON2_TIME_COST: 'nope',
        }),
      /PASSWORD_ARGON2_TIME_COST/,
    );
  });
});
