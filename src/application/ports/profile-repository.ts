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
  /** MVP single default profile for the account (BE-035). */
  findDefaultByAccount(accountId: string): Promise<Profile | null>;
  insert(profile: NewProfile): Promise<Profile>;
  save(profile: Profile): Promise<Profile>;
  /** Hard-delete every profile for the account (Postgres ON DELETE CASCADE). */
  deleteByAccount(accountId: string): Promise<number>;
}
