import { DomainError } from '../../domain/shared/domain-error.js';
import type { SourceTestReason } from '../../domain/sources/user-source.js';
import type { ParseM3uPlaylist } from '../catalog/parse-m3u-playlist.js';
import type { XtreamCodesClient } from '../ports/xtream-codes-client.js';
import type { SourceCredentialCipher } from '../ports/source-credential-cipher.js';
import type { SourceRepository } from '../ports/source-repository.js';
import { classifySourceTestError } from './classify-source-test-error.js';
import { FetchSourceUrlSafely } from './fetch-source-url-safely.js';
import {
  toSourcePublicView,
  type SourcePublicView,
} from './source-public-view.js';

export type SourceTestResult = {
  readonly ok: boolean;
  readonly reason: SourceTestReason;
  readonly message: string;
  /** Updated source projection; user configuration is preserved on failure. */
  readonly source: SourcePublicView;
};

/**
 * POST /sources/{id}/test — connectivity probe with classified failure reasons (BE-043).
 */
export class TestSource {
  constructor(
    private readonly sources: SourceRepository,
    private readonly cipher: SourceCredentialCipher,
    private readonly fetchSourceUrlSafely: FetchSourceUrlSafely,
    private readonly parseM3uPlaylist: ParseM3uPlaylist,
    private readonly xtreamClient: XtreamCodesClient,
    private readonly timeoutMs: number,
  ) {}

  async execute(
    accountId: string,
    sourceId: string,
  ): Promise<SourceTestResult> {
    const existing = await this.sources.findById(accountId, sourceId);
    if (existing === null || existing.deletedAt !== null) {
      throw new DomainError('Source not found', 'SOURCE_NOT_FOUND');
    }
    if (existing.kind === 'proprietary') {
      throw new DomainError(
        'Proprietary catalog sources cannot be tested here',
        'SOURCE_NOT_TESTABLE',
      );
    }
    if (existing.uriRef === null || existing.uriRef.trim() === '') {
      throw new DomainError(
        'Source uriRef is required for connectivity test',
        'SOURCE_INPUT_INVALID',
      );
    }

    try {
      await withTimeout(
        this.probe(
          existing.kind,
          existing.uriRef,
          existing.credentialsEncrypted,
        ),
        this.timeoutMs,
      );
      const saved = await this.sources.save({
        ...existing,
        status: 'ok',
        statusReason: null,
        syncVersion: existing.syncVersion + 1,
        updatedAt: new Date(),
      });
      return {
        ok: true,
        reason: 'ok',
        message: 'Source connectivity check succeeded',
        source: toSourcePublicView(saved),
      };
    } catch (error: unknown) {
      const classified = classifySourceTestError(error);
      const saved = await this.sources.save({
        ...existing,
        status: 'error',
        statusReason: classified.reason,
        syncVersion: existing.syncVersion + 1,
        updatedAt: new Date(),
      });
      return {
        ok: false,
        reason: classified.reason,
        message: classified.message,
        source: toSourcePublicView(saved),
      };
    }
  }

  private async probe(
    kind: 'm3u' | 'xtream',
    uriRef: string,
    credentialsEncrypted: Uint8Array | null,
  ): Promise<void> {
    if (kind === 'm3u') {
      const fetched = await this.fetchSourceUrlSafely.execute(uriRef);
      if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
        throw new DomainError(
          `Playlist HTTP status ${fetched.statusCode}`,
          'SOURCE_UNREACHABLE',
        );
      }
      const parsed = await this.parseM3uPlaylist.execute(fetched.body);
      if (parsed.entries.length === 0) {
        throw new DomainError(
          'Playlist contained no playable entries',
          'SOURCE_INVALID_PLAYLIST',
        );
      }
      return;
    }

    if (credentialsEncrypted === null) {
      throw new DomainError(
        'xtream sources require credentials',
        'SOURCE_CREDENTIALS_REQUIRED',
      );
    }
    const secrets = this.cipher.decrypt(credentialsEncrypted);
    if (
      secrets.username === undefined ||
      secrets.username.length === 0 ||
      secrets.password === undefined ||
      secrets.password.length === 0
    ) {
      throw new DomainError(
        'xtream sources require username and password',
        'SOURCE_CREDENTIALS_REQUIRED',
      );
    }
    await this.xtreamClient.authenticate({
      baseUrl: uriRef,
      username: secrets.username,
      password: secrets.password,
    });
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Source connectivity check timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
