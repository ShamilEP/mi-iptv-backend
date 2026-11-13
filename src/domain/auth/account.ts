export type AccountStatus = 'active' | 'suspended' | 'pending_deletion';

export type AccountRole = 'user' | 'support' | 'admin';

/**
 * Account identity for authentication (Backend §5.1 / Security §2.1).
 */
export type Account = {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: AccountRole;
  readonly status: AccountStatus;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Lightweight registration email check (BE-020).
 * Requires a non-empty local part, `@`, and a domain with a dot.
 */
export function isValidAccountEmail(email: string): boolean {
  const normalized = normalizeAccountEmail(email);
  if (normalized.length === 0 || normalized.length > 254) {
    return false;
  }
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) {
    return false;
  }
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (local.length === 0 || local.length > 64) {
    return false;
  }
  if (domain.includes('..') || local.includes('..')) {
    return false;
  }
  const domainDot = domain.indexOf('.');
  return domainDot > 0 && domainDot < domain.length - 1;
}
