import type {
  NewRefreshTokenRecord,
  RefreshTokenRecord,
  RefreshTokenRepository,
  RefreshTokenRevokeReason,
} from '../../application/ports/refresh-token-repository.js';

/**
 * Sprint 0 refresh-token hash store. Replace with a Postgres adapter.
 */
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly byId = new Map<string, RefreshTokenRecord>();
  private readonly idByHash = new Map<string, string>();

  async insert(row: NewRefreshTokenRecord): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      ...row,
      usedAt: row.usedAt ?? null,
      replacedBy: row.replacedBy ?? null,
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

  async markRotated(
    id: string,
    usedAt: Date,
    replacedBy: string,
  ): Promise<RefreshTokenRecord> {
    const current = this.byId.get(id);
    if (current === undefined) {
      throw new Error(`Refresh token not found: ${id}`);
    }
    if (current.usedAt !== null || current.revokedAt !== null) {
      throw new Error(`Refresh token already spent: ${id}`);
    }
    const updated: RefreshTokenRecord = {
      ...current,
      usedAt,
      replacedBy,
    };
    this.byId.set(id, updated);
    return updated;
  }

  async revokeFamily(
    familyId: string,
    reason: RefreshTokenRevokeReason,
    revokedAt: Date,
  ): Promise<number> {
    return this.revokeWhere(
      (row) => row.familyId === familyId,
      reason,
      revokedAt,
    );
  }

  async revokeByDevice(
    accountId: string,
    deviceId: string,
    reason: RefreshTokenRevokeReason,
    revokedAt: Date,
  ): Promise<number> {
    return this.revokeWhere(
      (row) => row.accountId === accountId && row.deviceId === deviceId,
      reason,
      revokedAt,
    );
  }

  async revokeByAccount(
    accountId: string,
    reason: RefreshTokenRevokeReason,
    revokedAt: Date,
  ): Promise<number> {
    return this.revokeWhere(
      (row) => row.accountId === accountId,
      reason,
      revokedAt,
    );
  }

  async deleteByAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.byId) {
      if (row.accountId !== accountId) {
        continue;
      }
      this.byId.delete(id);
      this.idByHash.delete(hashKeyOf(row.tokenHash));
      count += 1;
    }
    return count;
  }

  private async revokeWhere(
    predicate: (row: RefreshTokenRecord) => boolean,
    reason: RefreshTokenRevokeReason,
    revokedAt: Date,
  ): Promise<number> {
    let count = 0;
    for (const [id, row] of this.byId) {
      if (row.revokedAt !== null || !predicate(row)) {
        continue;
      }
      this.byId.set(id, {
        ...row,
        revokedAt,
        revokedReason: reason,
      });
      count += 1;
    }
    return count;
  }
}

function hashKeyOf(tokenHash: Uint8Array): string {
  return Buffer.from(tokenHash).toString('hex');
}
