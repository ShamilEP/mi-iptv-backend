import type { UserSource } from '../../domain/sources/user-source.js';

export type NewUserSource = Omit<
  UserSource,
  'syncVersion' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  readonly deletedAt?: Date | null;
};

export interface SourceRepository {
  listByAccount(accountId: string): Promise<readonly UserSource[]>;
  /** Includes soft-deleted rows for account export (BE-013). */
  listAllByAccount(accountId: string): Promise<readonly UserSource[]>;
  findById(accountId: string, sourceId: string): Promise<UserSource | null>;
  insert(source: NewUserSource): Promise<UserSource>;
  save(source: UserSource): Promise<UserSource>;
  /** Hard-delete every source for the account (wipes ciphertext). */
  deleteByAccount(accountId: string): Promise<number>;
}
