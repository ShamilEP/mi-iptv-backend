import type {
  NewRefreshTokenRecord,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../../application/ports/refresh-token-repository.js';

/**
 * Sprint 0 refresh-token hash store. Replace with Postgres adapter.
 */
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly byId = new Map<string, RefreshTokenRecord>();
  private readonly idByHash = new Map<string, string>();

  async insert(row: NewRefreshTokenRecord): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      ...row,
      usedAt: row.usedAt ?? null,
      revokedAt: row.revokedAt ?? null,
      revokedReason: row.revokedReason ?? null,
    };
    const hashKey = hashKeyOf(record.tokenHash);
    if (this.idByHash.has(hashKey)) {
      throw new Error('Refresh token hash already stored');
    }
    this.byId.set(record.id, record);
    this.idByHash.set(hashKey, record.id);
    return record;
  }

  async findByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<RefreshTokenRecord | null> {
    const id = this.idByHash.get(hashKeyOf(tokenHash));
    if (id === undefined) {
      return null;
    }
    return this.byId.get(id) ?? null;
  }
}

function hashKeyOf(tokenHash: Uint8Array): string {
  return Buffer.from(tokenHash).toString('hex');
}
