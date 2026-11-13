import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertPasswordMeetsPolicy,
  isPasswordPolicyCompliant,
  PASSWORD_MIN_LENGTH,
  PasswordPolicyError,
} from '../../src/domain/auth/password-policy.js';

describe('password policy (BE-120 / Security §2.1)', () => {
  it(`requires at least ${PASSWORD_MIN_LENGTH} characters, one digit, and one special`, () => {
    assert.equal(isPasswordPolicyCompliant('Abcd1!xy'), true);
    assert.equal(isPasswordPolicyCompliant('password1!'), true);
    assert.equal(isPasswordPolicyCompliant('Short1!'), false);
    assert.equal(isPasswordPolicyCompliant('NoDigit!!'), false);
    assert.equal(isPasswordPolicyCompliant('NoSpecial1'), false);
    assert.equal(isPasswordPolicyCompliant(''), false);
  });

  it('assertPasswordMeetsPolicy throws PasswordPolicyError with a clear reason', () => {
    assert.throws(
      () => assertPasswordMeetsPolicy('tiny'),
      (error: unknown) =>
        error instanceof PasswordPolicyError &&
        error.code === 'PASSWORD_POLICY_VIOLATION' &&
        /at least 8/.test(error.message),
    );
    assert.throws(
      () => assertPasswordMeetsPolicy('longenough!'),
      (error: unknown) =>
        error instanceof PasswordPolicyError && /number/.test(error.message),
    );
    assert.throws(
      () => assertPasswordMeetsPolicy('longenough1'),
      (error: unknown) =>
        error instanceof PasswordPolicyError && /special/.test(error.message),
    );
    assert.doesNotThrow(() => assertPasswordMeetsPolicy('Valid12!'));
  });
});
