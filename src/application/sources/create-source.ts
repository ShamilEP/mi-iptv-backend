import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error.js';
import { isMutableSourceKind } from '../../domain/sources/user-source.js';
import type { SourceCredentialCipher } from '../ports/source-credential-cipher.js';
import type { SourceRepository } from '../ports/source-repository.js';
import {
  toSourcePublicView,
  type SourcePublicView,
} from './source-public-view.js';

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
  ) {}

  async execute(input: CreateSourceInput): Promise<SourcePublicView> {
    if (!isMutableSourceKind(input.kind)) {
      throw new DomainError(
        'kind must be m3u or xtream',
        'SOURCE_KIND_INVALID',
      );
    }
    const name = input.name.trim();
    const uriRef = input.uriRef.trim();
    if (name === '' || uriRef === '') {
      throw new DomainError(
        'name and uriRef are required',
        'SOURCE_INPUT_INVALID',
      );
    }

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

    const created = await this.sources.insert({
      id: randomUUID(),
      accountId: input.accountId,
      kind: input.kind,
      name,
      uriRef,
      credentialsEncrypted,
      encKeyId,
      priority: input.priority ?? 100,
      enabled: true,
      status: 'pending',
      statusReason: null,
    });
    return toSourcePublicView(created);
  }
}
