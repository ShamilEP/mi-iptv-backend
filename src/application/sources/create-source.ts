import { randomUUID } from 'node:crypto';
import { normalizeDisplayText } from '../../domain/catalog/display-text.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import { isMutableSourceKind } from '../../domain/sources/user-source.js';
import type { AccountSyncClock } from '../ports/account-sync-clock.js';
import type { SourceCredentialCipher } from '../ports/source-credential-cipher.js';
import type { SourceRepository } from '../ports/source-repository.js';
import {
  toSourcePublicView,
  type SourcePublicView,
} from './source-public-view.js';
import type { ValidateSourceUrl } from './validate-source-url.js';

export type CreateSourceInput = {
  readonly accountId: string;
  readonly kind: string;
  readonly name: string;
  readonly uriRef: string;
  readonly credentials?: {
    readonly username?: string;
    readonly password?: string;
    readonly token?: string;
  };
  readonly priority?: number;
};

export class CreateSource {
  constructor(
    private readonly sources: SourceRepository,
    private readonly cipher: SourceCredentialCipher,
    /** Required so peers observe the create on GET /sync/state (BE-064 / ADR-009). */
    private readonly syncClock: AccountSyncClock,
    /** SEC-033 / BE-041: reject SSRF targets before persist. */
    private readonly validateSourceUrl: ValidateSourceUrl,
  ) {}

  async execute(input: CreateSourceInput): Promise<SourcePublicView> {
    if (!isMutableSourceKind(input.kind)) {
      throw new DomainError(
        'kind must be m3u or xtream',
        'SOURCE_KIND_INVALID',
      );
    }
    const name = normalizeDisplayText(input.name);
    const uriRef = input.uriRef.trim();
    if (name === '' || uriRef === '') {
      throw new DomainError(
        'name and uriRef are required',
        'SOURCE_INPUT_INVALID',
      );
    }

    const validated = await this.validateSourceUrl.execute(uriRef);

    let credentialsEncrypted: Uint8Array | null = null;
    let encKeyId: string | null = null;
    if (input.credentials !== undefined) {
      const encrypted = this.cipher.encrypt(input.credentials);
      credentialsEncrypted = encrypted.ciphertext;
      encKeyId = encrypted.keyId;
    } else if (input.kind === 'xtream') {
      throw new DomainError(
        'xtream sources require credentials',
        'SOURCE_CREDENTIALS_REQUIRED',
      );
    }

    const changeSeq = await this.syncClock.nextChangeSeq(input.accountId);
    const created = await this.sources.insert({
      id: randomUUID(),
      accountId: input.accountId,
      kind: input.kind,
      name,
      uriRef: validated.url.href,
      credentialsEncrypted,
      encKeyId,
      priority: input.priority ?? 100,
      enabled: true,
      status: 'pending',
      statusReason: null,
      itemCount: null,
      lastIngestedAt: null,
      changeSeq,
    });
    return toSourcePublicView(created);
  }
}
