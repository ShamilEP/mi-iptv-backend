import { DomainError } from '../shared/domain-error.js';

/** Parental PIN: 4–8 decimal digits (FR-023 / BE-037). */
export const PARENTAL_PIN_MIN_LENGTH = 4;
export const PARENTAL_PIN_MAX_LENGTH = 8;

const PIN_PATTERN = /^\d+$/;

/**
 * Validates clear PIN shape. Does not hash — hashing stays behind PasswordHasher.
 */
export function assertParentalPinPolicy(plainPin: string): string {
  const trimmed = plainPin.trim();
  if (
    trimmed.length < PARENTAL_PIN_MIN_LENGTH ||
    trimmed.length > PARENTAL_PIN_MAX_LENGTH
  ) {
    throw new DomainError(
      `PIN must be ${PARENTAL_PIN_MIN_LENGTH}–${PARENTAL_PIN_MAX_LENGTH} digits`,
      'PARENTAL_PIN_INVALID',
    );
  }
  if (!PIN_PATTERN.test(trimmed)) {
    throw new DomainError('PIN must be numeric digits only', 'PARENTAL_PIN_INVALID');
  }
  return trimmed;
}
