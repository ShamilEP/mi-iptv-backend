import type { UserSource } from '../../domain/sources/user-source.js';

export type NewUserSource = Omit<
  UserSource,
  'syncVersion' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  readonly deletedAt?: Date | null;
};

export interface SourceRepository {
  listByAccount(accountId: string): Promise<readonly UserSource[]>;
  findById(accountId: string, sourceId: string): Promise<UserSource | null>;
  insert(source: NewUserSource): Promise<UserSource>;
  save(source: UserSource): Promise<UserSource>;
}
