import { DomainError } from '../../domain/shared/domain-error.js';
import type { SourceCredentialCipher } from '../ports/source-credential-cipher.js';
import type { SourceRepository } from '../ports/source-repository.js';
import {
  toSourcePublicView,
  type SourcePublicView,
} from './source-public-view.js';

export type UpdateSourceInput = {
  readonly accountId: string;
  readonly sourceId: string;
  readonly name?: string;
  readonly uriRef?: string;
  readonly priority?: number;
  readonly enabled?: boolean;
  readonly credentials?: {
    readonly username?: string;
    readonly password?: string;
    readonly token?: string;
  };
};

/**
 * PATCH semantics: edit metadata, prioritize, deactivate/reactivate, rotate credentials.
 */
export class UpdateSource {
  constructor(
    private readonly sources: SourceRepository,
    private readonly cipher: SourceCredentialCipher,
  ) {}

  async execute(input: UpdateSourceInput): Promise<SourcePublicView> {
    const existing = await this.sources.findById(
      input.accountId,
      input.sourceId,
    );
    if (existing === null || existing.deletedAt !== null) {
      throw new DomainError('Source not found', 'SOURCE_NOT_FOUND');
    }
    if (existing.kind === 'proprietary') {
      throw new DomainError(
        'Proprietary catalog sources are not editable here',
        'SOURCE_NOT_EDITABLE',
      );
    }

    let credentialsEncrypted = existing.credentialsEncrypted;
    let encKeyId = existing.encKeyId;
    if (input.credentials !== undefined) {
      const encrypted = this.cipher.encrypt(input.credentials);
      credentialsEncrypted = encrypted.ciphertext;
      encKeyId = encrypted.keyId;
    }

    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const uriRef =
      input.uriRef !== undefined ? input.uriRef.trim() : existing.uriRef;
    if (name === '' || (uriRef !== null && uriRef === '')) {
      throw new DomainError(
        'name and uriRef must not be empty',
        'SOURCE_INPUT_INVALID',
      );
    }

    const saved = await this.sources.save({
      ...existing,
      name,
      uriRef,
      priority: input.priority ?? existing.priority,
      enabled: input.enabled ?? existing.enabled,
      credentialsEncrypted,
      encKeyId,
      syncVersion: existing.syncVersion + 1,
      updatedAt: new Date(),
    });
    return toSourcePublicView(saved);
  }
}
