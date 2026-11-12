import { DomainError } from '../../domain/shared/domain-error.js';
import type { SourceRepository } from '../ports/source-repository.js';

export class DeleteSource {
  constructor(private readonly sources: SourceRepository) {}

  async execute(accountId: string, sourceId: string): Promise<void> {
    const existing = await this.sources.findById(accountId, sourceId);
    if (existing === null || existing.deletedAt !== null) {
      throw new DomainError('Source not found', 'SOURCE_NOT_FOUND');
    }
    if (existing.kind === 'proprietary') {
      throw new DomainError(
        'Proprietary catalog sources cannot be deleted by the account',
        'SOURCE_NOT_DELETABLE',
      );
    }

    await this.sources.save({
      ...existing,
      credentialsEncrypted: null,
      encKeyId: null,
      enabled: false,
      deletedAt: new Date(),
      syncVersion: existing.syncVersion + 1,
      updatedAt: new Date(),
    });
  }
}
