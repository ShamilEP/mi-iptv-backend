import { normalizeDisplayText } from '../../domain/catalog/display-text.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccountSyncClock } from '../ports/account-sync-clock.js';
import type { SourceCredentialCipher } from '../ports/source-credential-cipher.js';
import type { SourceRepository } from '../ports/source-repository.js';
import {
  toSourcePublicView,
  type SourcePublicView,
} from './source-public-view.js';
import type { ValidateSourceUrl } from './validate-source-url.js';

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
    /** Required so peers observe the patch on GET /sync/state (BE-064 / ADR-009). */
    private readonly syncClock: AccountSyncClock,
    /** SEC-033 / BE-041: reject SSRF targets when uriRef changes. */
    private readonly validateSourceUrl: ValidateSourceUrl,
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

    const name =
      input.name !== undefined
        ? normalizeDisplayText(input.name)
        : existing.name;
    let uriRef = existing.uriRef;
    if (input.uriRef !== undefined) {
      const trimmed = input.uriRef.trim();
      if (trimmed === '') {
        throw new DomainError(
          'name and uriRef must not be empty',
          'SOURCE_INPUT_INVALID',
        );
      }
      const validated = await this.validateSourceUrl.execute(trimmed);
      uriRef = validated.url.href;
    }
    if (name === '') {
      throw new DomainError(
        'name and uriRef must not be empty',
        'SOURCE_INPUT_INVALID',
      );
    }

    const changeSeq = await this.syncClock.nextChangeSeq(input.accountId);
    const saved = await this.sources.save({
      ...existing,
      name,
      uriRef,
      priority: input.priority ?? existing.priority,
      enabled: input.enabled ?? existing.enabled,
      credentialsEncrypted,
      encKeyId,
      syncVersion: existing.syncVersion + 1,
      changeSeq,
      updatedAt: new Date(),
    });
    return toSourcePublicView(saved);
  }
}
