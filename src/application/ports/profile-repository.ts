import type { Profile } from '../../domain/profiles/profile.js';

export type NewProfile = Omit<Profile, 'createdAt' | 'updatedAt'> & {
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
};

/**
 * Persistence for account profiles (BE-013 cascade delete / data export).
 */
export interface ProfileRepository {
  listByAccount(accountId: string): Promise<readonly Profile[]>;
  insert(profile: NewProfile): Promise<Profile>;
  /** Hard-delete every profile for the account (Postgres ON DELETE CASCADE). */
  deleteByAccount(accountId: string): Promise<number>;
}
