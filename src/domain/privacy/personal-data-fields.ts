/**
 * Security §6 / NFR-006 — personal data minimization.
 * Account email is the only personal data collected for auth/service identity.
 */
export const PERSONAL_DATA_FIELD_NAMES = ['email'] as const;

export type PersonalDataFieldName = (typeof PERSONAL_DATA_FIELD_NAMES)[number];

export function isPersonalDataFieldName(name: string): boolean {
  return (PERSONAL_DATA_FIELD_NAMES as readonly string[]).includes(name);
}
