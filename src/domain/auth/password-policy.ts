import { DomainError } from '../shared/domain-error.js';

/** Security §2.1 — minimum password length. */
export const PASSWORD_MIN_LENGTH = 8;

const HAS_DIGIT = /\d/;
/** Non-alphanumeric character (special). */
const HAS_SPECIAL = /[^A-Za-z0-9]/;

export type PasswordPolicyErrorCode = 'PASSWORD_POLICY_VIOLATION';

export class PasswordPolicyError extends DomainError {
  constructor(
    message: string,
    override readonly code: PasswordPolicyErrorCode = 'PASSWORD_POLICY_VIOLATION',
  ) {
    super(message, code);
    this.name = 'PasswordPolicyError';
  }
}

/**
 * Password policy (Security §2.1): ≥8 characters, ≥1 digit, ≥1 special.
 * Pure domain rule — hashing stays behind PasswordHasher.
 */
export function isPasswordPolicyCompliant(password: string): boolean {
  if (typeof password !== 'string') {
    return false;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return false;
  }
  if (!HAS_DIGIT.test(password)) {
    return false;
  }
  if (!HAS_SPECIAL.test(password)) {
    return false;
  }
  return true;
}

export function assertPasswordMeetsPolicy(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (!HAS_DIGIT.test(password)) {
    throw new PasswordPolicyError('Password must include at least one number');
  }
  if (!HAS_SPECIAL.test(password)) {
    throw new PasswordPolicyError(
      'Password must include at least one special character',
    );
  }
}
