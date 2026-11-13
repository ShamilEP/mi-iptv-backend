import type {
  NewProfile,
  ProfileRepository,
} from '../../application/ports/profile-repository.js';
import type { Profile } from '../../domain/profiles/profile.js';

/**
 * Sprint 0 profile store. Replace with a Postgres adapter over RelationalDatabase.
 */
export class InMemoryProfileRepository implements ProfileRepository {
  private readonly byId = new Map<string, Profile>();

  async listByAccount(accountId: string): Promise<readonly Profile[]> {
    return [...this.byId.values()]
      .filter((row) => row.accountId === accountId)
      .sort(
        (a, b) =>
          Number(b.isDefault) - Number(a.isDefault) ||
          a.name.localeCompare(b.name),
      );
  }

  async findById(
    accountId: string,
    profileId: string,
  ): Promise<Profile | null> {
    const row = this.byId.get(profileId);
    if (!row || row.accountId !== accountId) {
      return null;
    }
    return row;
  }

  async findDefaultByAccount(accountId: string): Promise<Profile | null> {
    const rows = await this.listByAccount(accountId);
    return rows.find((row) => row.isDefault) ?? rows[0] ?? null;
  }

  async insert(profile: NewProfile): Promise<Profile> {
    const now = new Date();
    const row: Profile = {
      ...profile,
      createdAt: profile.createdAt ?? now,
      updatedAt: profile.updatedAt ?? now,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async save(profile: Profile): Promise<Profile> {
    this.byId.set(profile.id, profile);
    return profile;
  }

  async deleteById(accountId: string, profileId: string): Promise<boolean> {
    const row = this.byId.get(profileId);
    if (!row || row.accountId !== accountId) {
      return false;
    }
    this.byId.delete(profileId);
    return true;
  }

  async deleteByAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.byId) {
      if (row.accountId !== accountId) {
        continue;
      }
      this.byId.delete(id);
      count += 1;
    }
    return count;
  }
}
