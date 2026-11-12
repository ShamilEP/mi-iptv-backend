import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import type { ParseM3uPlaylist } from '../../src/application/catalog/parse-m3u-playlist.js';
import type { XtreamCodesClient } from '../../src/application/ports/xtream-codes-client.js';
import { CreateSource } from '../../src/application/sources/create-source.js';
import type { FetchSourceUrlSafely } from '../../src/application/sources/fetch-source-url-safely.js';
import { TestSource } from '../../src/application/sources/test-source.js';
import type { M3uParseResult } from '../../src/domain/catalog/m3u-entry.js';
import { XtreamError } from '../../src/domain/catalog/xtream-error.js';
import { SsrfGuardError } from '../../src/domain/sources/ssrf-guard-error.js';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';

const accountId = '11111111-1111-1111-1111-111111111111';

function stubFetch(
  impl: FetchSourceUrlSafely['execute'],
): FetchSourceUrlSafely {
  return { execute: impl } as FetchSourceUrlSafely;
}

function stubM3u(impl: ParseM3uPlaylist['execute']): ParseM3uPlaylist {
  return { execute: impl } as ParseM3uPlaylist;
}

function stubXtream(
  authenticate: XtreamCodesClient['authenticate'],
): XtreamCodesClient {
  return {
    authenticate,
    fetchLiveCategories: async () => [],
    fetchLiveStreams: async () => [],
    fetchVodCategories: async () => [],
    fetchVodStreams: async () => [],
    fetchSeriesCategories: async () => [],
    fetchSeries: async () => [],
    fetchCatalog: async () => {
      throw new Error('not used');
    },
  };
}

describe('TestSource', () => {
  it('marks M3U sources ok when playlist fetch+parse succeeds', async () => {
    const repo = new InMemorySourceRepository();
    const cipher = new Aes256GcmSourceCredentialCipher(
      randomBytes(32),
      'key-dev',
    );
    const created = await new CreateSource(repo, cipher).execute({
      accountId,
      kind: 'm3u',
      name: 'List',
      uriRef: 'https://cdn.example.com/list.m3u',
    });

    const parsed: M3uParseResult = {
      entries: [
        {
          title: 'Ch',
          tvgId: null,
          tvgName: null,
          tvgLogo: null,
          groupTitle: null,
          streamUri: 'https://stream.example/1.ts',
          durationSec: -1,
          lineNumber: 2,
        },
      ],
      stats: {
        entryCount: 1,
        skippedLineCount: 0,
        bytesRead: 10,
        encoding: 'utf-8',
      },
    };

    const useCase = new TestSource(
      repo,
      cipher,
      stubFetch(async () => ({
        finalUrl: 'https://cdn.example.com/list.m3u',
        statusCode: 200,
        body: new TextEncoder().encode('#EXTM3U'),
        redirectCount: 0,
      })),
      stubM3u(async () => parsed),
      stubXtream(async () => {
        throw new Error('not used');
      }),
      5_000,
    );

    const result = await useCase.execute(accountId, created.id);
    assert.equal(result.ok, true);
    assert.equal(result.reason, 'ok');
    assert.equal(result.source.status, 'ok');
    assert.equal(result.source.statusReason, null);
    assert.equal(result.source.uriRef, 'https://cdn.example.com/list.m3u');
  });

  it('classifies xtream auth failure and keeps user input', async () => {
    const repo = new InMemorySourceRepository();
    const cipher = new Aes256GcmSourceCredentialCipher(
      randomBytes(32),
      'key-dev',
    );
    const created = await new CreateSource(repo, cipher).execute({
      accountId,
      kind: 'xtream',
      name: 'Panel',
      uriRef: 'https://panel.example.com',
      credentials: { username: 'u', password: 'p' },
    });

    const useCase = new TestSource(
      repo,
      cipher,
      stubFetch(async () => {
        throw new Error('not used');
      }),
      stubM3u(async () => {
        throw new Error('not used');
      }),
      stubXtream(async () => {
        throw new XtreamError('bad auth', 'XTREAM_AUTH_FAILED');
      }),
      5_000,
    );

    const result = await useCase.execute(accountId, created.id);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'auth_failed');
    assert.equal(result.source.status, 'error');
    assert.equal(result.source.statusReason, 'auth_failed');
    assert.equal(result.source.uriRef, 'https://panel.example.com');
    assert.equal(result.source.name, 'Panel');
    assert.equal(result.source.credentialsConfigured, true);
    assert.equal(result.source.password, null);
  });

  it('classifies fetch timeout', async () => {
    const repo = new InMemorySourceRepository();
    const cipher = new Aes256GcmSourceCredentialCipher(
      randomBytes(32),
      'key-dev',
    );
    const created = await new CreateSource(repo, cipher).execute({
      accountId,
      kind: 'm3u',
      name: 'Slow',
      uriRef: 'https://cdn.example.com/slow.m3u',
    });

    const useCase = new TestSource(
      repo,
      cipher,
      stubFetch(async () => {
        throw new SsrfGuardError('timed out', 'SOURCE_HTTP_TIMEOUT');
      }),
      stubM3u(async () => {
        throw new Error('not used');
      }),
      stubXtream(async () => {
        throw new Error('not used');
      }),
      5_000,
    );

    const result = await useCase.execute(accountId, created.id);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'timeout');
    assert.equal(result.source.statusReason, 'timeout');
  });
});
