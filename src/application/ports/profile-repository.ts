import type { Profile } from '../../domain/profiles/profile.js';

export type NewProfile = Omit<Profile, 'createdAt' | 'updatedAt'> & {
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
};

/**
 * Persistence for account profiles (BE-013 cascade delete / data export / BE-036).
 */
export interface ProfileRepository {
  listByAccount(accountId: string): Promise<readonly Profile[]>;
  findById(accountId: string, profileId: string): Promise<Profile | null>;
  /** Default (or sole) profile for the account (BE-029 / BE-035). */
  findDefaultByAccount(accountId: string): Promise<Profile | null>;
  insert(profile: NewProfile): Promise<Profile>;
  save(profile: Profile): Promise<Profile>;
  /** Hard-delete one profile owned by the account. */
  deleteById(accountId: string, profileId: string): Promise<boolean>;
  /** Hard-delete every profile for the account (Postgres ON DELETE CASCADE). */
  deleteByAccount(accountId: string): Promise<number>;
}
