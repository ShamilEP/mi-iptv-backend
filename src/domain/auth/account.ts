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
