import type { UserSource } from '../../domain/sources/user-source.js';
import type {
  NewUserSource,
  SourceRepository,
} from '../../application/ports/source-repository.js';

/**
 * Sprint 0 source registry store. Replace with a Postgres adapter after `pg` is approved.
 */
export class InMemorySourceRepository implements SourceRepository {
  private readonly byId = new Map<string, UserSource>();

  async listByAccount(accountId: string): Promise<readonly UserSource[]> {
    return [...this.byId.values()]
      .filter((row) => row.accountId === accountId && row.deletedAt === null)
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

  async listAllByAccount(accountId: string): Promise<readonly UserSource[]> {
    return [...this.byId.values()]
      .filter((row) => row.accountId === accountId)
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

  async findById(
    accountId: string,
    sourceId: string,
  ): Promise<UserSource | null> {
    const row = this.byId.get(sourceId);
    if (!row || row.accountId !== accountId) {
      return null;
    }
    return row;
  }

  async insert(source: NewUserSource): Promise<UserSource> {
    const now = new Date();
    const row: UserSource = {
      ...source,
      syncVersion: 1,
      deletedAt: source.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async save(source: UserSource): Promise<UserSource> {
    this.byId.set(source.id, source);
    return source;
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
