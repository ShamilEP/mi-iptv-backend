/**
 * Child-privacy engineering policy for kid profiles / parental PIN (SEC-044 / FR-023).
 * Household kid profiles must not collect children's personal identity data.
 */

/** Fields the backend must never solicit or persist for kid/child identity. */
export const CHILD_DATA_NOT_COLLECTED = [
  'dateOfBirth',
  'age',
  'childEmail',
  'childPhone',
  'governmentId',
  'schoolId',
] as const;

export type ChildDataNotCollectedField =
  (typeof CHILD_DATA_NOT_COLLECTED)[number];

/**
 * Functional / secret fields used by parental controls — not child identity PII.
 * Documented for inventory alignment with SEC-040 / SEC-044.
 */
export const PARENTAL_CONTROL_FIELD_NAMES = [
  'kidMode',
  'maxRating',
  'allowedSourceIds',
  'blockedSourceIds',
  'pinConfigured',
  'pinHash',
] as const;

export function isForbiddenChildDataField(name: string): boolean {
  const normalized = name.trim();
  return (CHILD_DATA_NOT_COLLECTED as readonly string[]).includes(normalized);
}
