import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeAccountEmail } from '../../src/domain/auth/account.js';

describe('normalizeAccountEmail (BE-120 normalizers)', () => {
  it('trims and lowercases email for stable account identity', () => {
    assert.equal(normalizeAccountEmail('  User@Example.COM '), 'user@example.com');
    assert.equal(normalizeAccountEmail('a@b.co'), 'a@b.co');
  });
});
