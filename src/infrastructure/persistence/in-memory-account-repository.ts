import {
  normalizeAccountEmail,
  type Account,
} from '../../domain/auth/account.js';
import type { AccountRepository } from '../../application/ports/account-repository.js';

/**
 * Sprint 0 account store. Replace with a Postgres adapter over RelationalDatabase.
 */
export class InMemoryAccountRepository implements AccountRepository {
  private readonly byId = new Map<string, Account>();
  private readonly idByEmail = new Map<string, string>();

  async findByEmail(email: string): Promise<Account | null> {
    const id = this.idByEmail.get(normalizeAccountEmail(email));
    if (id === undefined) {
      return null;
    }
    return this.byId.get(id) ?? null;
  }

  async findById(accountId: string): Promise<Account | null> {
    return this.byId.get(accountId) ?? null;
  }

  async insert(account: Account): Promise<Account> {
    const email = normalizeAccountEmail(account.email);
    if (this.idByEmail.has(email)) {
      throw new Error(`Account email already exists: ${email}`);
    }
    const row: Account = { ...account, email };
    this.byId.set(row.id, row);
    this.idByEmail.set(email, row.id);
    return row;
  }

  async save(account: Account): Promise<Account> {
    const email = normalizeAccountEmail(account.email);
    const row: Account = { ...account, email };
    this.byId.set(row.id, row);
    this.idByEmail.set(email, row.id);
    return row;
  }
}
