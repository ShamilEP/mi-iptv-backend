import type { Account } from '../../domain/auth/account.js';

export interface AccountRepository {
  findByEmail(email: string): Promise<Account | null>;
  findById(accountId: string): Promise<Account | null>;
  insert(account: Account): Promise<Account>;
  save(account: Account): Promise<Account>;
  /** Hard-delete the account row (Postgres CASCADE removes tenant children). */
  delete(accountId: string): Promise<boolean>;
}
