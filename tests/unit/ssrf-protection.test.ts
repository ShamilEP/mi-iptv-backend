import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import type { DnsResolver } from '../../src/application/ports/dns-resolver.js';
import type {
  SourceHttpClient,
  SourceHttpRequest,
  SourceHttpResponse,
} from '../../src/application/ports/source-http-client.js';
import type { XtreamCodesClient } from '../../src/application/ports/xtream-codes-client.js';
import type { ParseM3uPlaylist } from '../../src/application/catalog/parse-m3u-playlist.js';
import { FetchSourceUrlSafely } from '../../src/application/sources/fetch-source-url-safely.js';
import { CreateSource } from '../../src/application/sources/create-source.js';
import { TestSource } from '../../src/application/sources/test-source.js';
import { ValidateSourceUrl } from '../../src/application/sources/validate-source-url.js';
import { SsrfGuardError } from '../../src/domain/sources/ssrf-guard-error.js';
import { Aes256GcmSourceCredentialCipher } from '../../src/infrastructure/crypto/aes256-gcm-source-credential-cipher.js';
import { HttpXtreamCodesClient } from '../../src/infrastructure/catalog/http-xtream-codes-client.js';
import { InMemorySourceRepository } from '../../src/infrastructure/persistence/in-memory-source-repository.js';

const accountId = '11111111-1111-1111-1111-111111111111';
const publicIp = '93.184.216.34';

class MapDns implements DnsResolver {
  constructor(private readonly map: Record<string, readonly string[]>) {}

  async resolveAll(hostname: string): Promise<readonly string[]> {
    const addresses = this.map[hostname];
    if (addresses === undefined) {
      throw new Error(`No DNS fixture for ${hostname}`);
    }
    return addresses;
  }
}

/** Returns successive answer sets per hostname (DNS rebinding fixtures). */
class SequenceDns implements DnsResolver {
  private readonly cursors = new Map<string, number>();

  constructor(
    private readonly sequences: Record<string, readonly (readonly string[])[]>,
  ) {}

  async resolveAll(hostname: string): Promise<readonly string[]> {
    const sequence = this.sequences[hostname];
    if (sequence === undefined || sequence.length === 0) {
      throw new Error(`No DNS sequence for ${hostname}`);
    }
    const index = this.cursors.get(hostname) ?? 0;
    const addresses = sequence[Math.min(index, sequence.length - 1)]!;
    this.cursors.set(hostname, index + 1);
    return addresses;
  }
}

class RecordingHttp implements SourceHttpClient {
  readonly requests: SourceHttpRequest[] = [];

  constructor(
    private readonly handler: (
      input: SourceHttpRequest,
    ) => SourceHttpResponse | Promise<SourceHttpResponse>,
  ) {}

  async request(input: SourceHttpRequest): Promise<SourceHttpResponse> {
    this.requests.push(input);
    return await this.handler(input);
  }
}

const guardLimits = {
  maxRedirects: 3,
  maxResponseBytes: 1024,
  timeoutMs: 1_000,
};

function safeFetch(
  dns: DnsResolver,
  http: SourceHttpClient,
): FetchSourceUrlSafely {
  return new FetchSourceUrlSafely(
    new ValidateSourceUrl(dns),
    http,
    guardLimits,
  );
}

function stubM3u(): ParseM3uPlaylist {
  return {
    execute: async () => {
      throw new Error('M3U parse should not run for blocked SSRF targets');
    },
  } as unknown as ParseM3uPlaylist;
}

function unusedXtream(): XtreamCodesClient {
  return {
    authenticate: async () => {
      throw new Error('not used');
    },
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

describe('SEC-031 SSRF protection — internal IPs', () => {
  const blockedLiterals = [
    'http://10.0.0.8/playlist.m3u',
    'http://172.16.5.1/playlist.m3u',
    'http://192.168.1.1/playlist.m3u',
    'http://127.0.0.1/playlist.m3u',
    'http://[::1]/playlist.m3u',
  ];

  for (const url of blockedLiterals) {
    it(`rejects literal internal target ${url}`, async () => {
      const useCase = new ValidateSourceUrl(new MapDns({}));
      await assert.rejects(
        () => useCase.execute(url),
        (error: unknown) =>
          error instanceof SsrfGuardError &&
          error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
      );
    });
  }

  it('rejects hostname that resolves to a private address', async () => {
    const useCase = new ValidateSourceUrl(
      new MapDns({ 'corp.example': ['10.1.2.3'] }),
    );
    await assert.rejects(
      () => useCase.execute('https://corp.example/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });
});

describe('SEC-031 SSRF protection — metadata endpoints', () => {
  it('rejects AWS IMDS link-local literal', async () => {
    const useCase = new ValidateSourceUrl(new MapDns({}));
    await assert.rejects(
      () => useCase.execute('http://169.254.169.254/latest/meta-data/'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('rejects Google metadata hostname at parse time', async () => {
    const useCase = new ValidateSourceUrl(new MapDns({}));
    await assert.rejects(
      () => useCase.execute('http://metadata.google.internal/computeMetadata/v1/'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_HOST_BLOCKED',
    );
  });

  it('rejects AWS IMDS IPv6 literal', async () => {
    const useCase = new ValidateSourceUrl(new MapDns({}));
    await assert.rejects(
      () => useCase.execute('http://[fd00:ec2::254]/latest/meta-data/'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('rejects hostname that resolves only to link-local metadata', async () => {
    const useCase = new ValidateSourceUrl(
      new MapDns({ 'imds.attacker': ['169.254.169.254'] }),
    );
    await assert.rejects(
      () => useCase.execute('http://imds.attacker/'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });
});

describe('SEC-031 SSRF protection — DNS rebinding', () => {
  it('connects to the validated resolved IP (not the hostname)', async () => {
    const http = new RecordingHttp(() => ({
      statusCode: 200,
      headers: {},
      body: new TextEncoder().encode('#EXTM3U'),
    }));
    const fetch = safeFetch(
      new MapDns({ 'cdn.example.com': [publicIp] }),
      http,
    );

    const result = await fetch.execute('https://cdn.example.com/list.m3u');
    assert.equal(result.statusCode, 200);
    assert.equal(http.requests.length, 1);
    assert.equal(http.requests[0]!.resolvedAddress, publicIp);
    assert.equal(http.requests[0]!.hostname, 'cdn.example.com');
  });

  it('blocks when DNS flips to a private address on a later hop', async () => {
    const http = new RecordingHttp((input) => {
      if (input.hostname === 'first.example') {
        return {
          statusCode: 302,
          headers: { location: 'https://rebind.example/secret' },
          body: new Uint8Array(),
        };
      }
      throw new Error('should not fetch rebind target');
    });
    const fetch = safeFetch(
      new SequenceDns({
        'first.example': [[publicIp]],
        'rebind.example': [['169.254.169.254']],
      }),
      http,
    );

    await assert.rejects(
      () => fetch.execute('https://first.example/start'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
    assert.equal(http.requests.length, 1);
  });

  it('blocks when any A/AAAA answer is private (mixed records)', async () => {
    const useCase = new ValidateSourceUrl(
      new MapDns({ 'mixed.example': [publicIp, '192.168.0.50'] }),
    );
    await assert.rejects(
      () => useCase.execute('https://mixed.example/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });
});

describe('SEC-031 SSRF protection — redirects', () => {
  it('rejects redirect Location pointing at loopback', async () => {
    const http = new RecordingHttp(() => ({
      statusCode: 302,
      headers: { location: 'http://127.0.0.1/admin' },
      body: new Uint8Array(),
    }));
    const fetch = safeFetch(
      new MapDns({ 'cdn.example.com': [publicIp] }),
      http,
    );

    await assert.rejects(
      () => fetch.execute('https://cdn.example.com/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('rejects redirect Location pointing at IMDS', async () => {
    const http = new RecordingHttp(() => ({
      statusCode: 301,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      body: new Uint8Array(),
    }));
    const fetch = safeFetch(
      new MapDns({ 'cdn.example.com': [publicIp] }),
      http,
    );

    await assert.rejects(
      () => fetch.execute('https://cdn.example.com/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('rejects redirect to a hostname that resolves privately', async () => {
    const http = new RecordingHttp((input) => {
      if (input.hostname === 'cdn.example.com') {
        return {
          statusCode: 307,
          headers: { location: 'https://intranet.example/list.m3u' },
          body: new Uint8Array(),
        };
      }
      throw new Error('intranet hop must not be fetched');
    });
    const fetch = safeFetch(
      new MapDns({
        'cdn.example.com': [publicIp],
        'intranet.example': ['10.0.0.9'],
      }),
      http,
    );

    await assert.rejects(
      () => fetch.execute('https://cdn.example.com/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('enforces redirect hop limit', async () => {
    const http = new RecordingHttp(() => ({
      statusCode: 302,
      headers: { location: 'https://cdn.example.com/next' },
      body: new Uint8Array(),
    }));
    const fetch = safeFetch(
      new MapDns({ 'cdn.example.com': [publicIp] }),
      http,
    );

    await assert.rejects(
      () => fetch.execute('https://cdn.example.com/start'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_HTTP_REDIRECT_LIMIT',
    );
    assert.equal(http.requests.length, guardLimits.maxRedirects + 1);
  });
});

describe('SEC-031 SSRF protection — source test path', () => {
  it('marks M3U source test unreachable for private DNS targets', async () => {
    const repo = new InMemorySourceRepository();
    const cipher = new Aes256GcmSourceCredentialCipher(
      randomBytes(32),
      'key-dev',
    );
    const created = await new CreateSource(repo, cipher).execute({
      accountId,
      kind: 'm3u',
      name: 'Evil',
      uriRef: 'https://evil.example/list.m3u',
    });

    const fetch = safeFetch(
      new MapDns({ 'evil.example': ['10.0.0.1'] }),
      new RecordingHttp(() => {
        throw new Error('must not HTTP-fetch private SSRF target');
      }),
    );

    const result = await new TestSource(
      repo,
      cipher,
      fetch,
      stubM3u(),
      unusedXtream(),
      5_000,
    ).execute(accountId, created.id);

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unreachable');
    assert.equal(result.source.status, 'error');
    assert.equal(result.source.uriRef, 'https://evil.example/list.m3u');
  });

  it('marks M3U source test unreachable for IMDS redirect', async () => {
    const repo = new InMemorySourceRepository();
    const cipher = new Aes256GcmSourceCredentialCipher(
      randomBytes(32),
      'key-dev',
    );
    const created = await new CreateSource(repo, cipher).execute({
      accountId,
      kind: 'm3u',
      name: 'Redirect',
      uriRef: 'https://cdn.example.com/list.m3u',
    });

    const fetch = safeFetch(
      new MapDns({ 'cdn.example.com': [publicIp] }),
      new RecordingHttp(() => ({
        statusCode: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        body: new Uint8Array(),
      })),
    );

    const result = await new TestSource(
      repo,
      cipher,
      fetch,
      stubM3u(),
      unusedXtream(),
      5_000,
    ).execute(accountId, created.id);

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unreachable');
  });
});

describe('SEC-031 SSRF protection — Xtream ingest path', () => {
  it('blocks player_api ingest when base URL resolves privately', async () => {
    const fetch = safeFetch(
      new MapDns({ 'panel.example': ['192.168.100.10'] }),
      new RecordingHttp(() => {
        throw new Error('must not HTTP-fetch private Xtream panel');
      }),
    );
    const client = new HttpXtreamCodesClient(fetch);

    await assert.rejects(
      () =>
        client.authenticate({
          baseUrl: 'https://panel.example',
          username: 'u',
          password: 'p',
        }),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });
});
