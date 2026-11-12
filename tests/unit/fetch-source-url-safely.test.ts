import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DnsResolver } from '../../src/application/ports/dns-resolver.js';
import type {
  SourceHttpClient,
  SourceHttpRequest,
  SourceHttpResponse,
} from '../../src/application/ports/source-http-client.js';
import { FetchSourceUrlSafely } from '../../src/application/sources/fetch-source-url-safely.js';
import { ValidateSourceUrl } from '../../src/application/sources/validate-source-url.js';
import { SsrfGuardError } from '../../src/domain/sources/ssrf-guard-error.js';

class FakeDns implements DnsResolver {
  constructor(private readonly map: Record<string, readonly string[]>) {}

  async resolveAll(hostname: string): Promise<readonly string[]> {
    const addresses = this.map[hostname];
    if (addresses === undefined) {
      throw new Error(`No DNS fixture for ${hostname}`);
    }
    return addresses;
  }
}

class ScriptedHttp implements SourceHttpClient {
  readonly calls: SourceHttpRequest[] = [];

  constructor(private readonly responses: SourceHttpResponse[]) {}

  async request(input: SourceHttpRequest): Promise<SourceHttpResponse> {
    this.calls.push(input);
    const next = this.responses.shift();
    if (next === undefined) {
      throw new Error('No scripted HTTP response left');
    }
    return next;
  }
}

describe('FetchSourceUrlSafely', () => {
  it('re-validates redirect targets and caps redirect count', async () => {
    const http = new ScriptedHttp([
      {
        statusCode: 302,
        headers: { location: 'https://files.example.com/next.m3u' },
        body: new Uint8Array(),
      },
      {
        statusCode: 302,
        headers: { location: 'https://files.example.com/final.m3u' },
        body: new Uint8Array(),
      },
    ]);
    const useCase = new FetchSourceUrlSafely(
      new ValidateSourceUrl(
        new FakeDns({
          'cdn.example.com': ['93.184.216.34'],
          'files.example.com': ['93.184.216.34'],
        }),
      ),
      http,
      { maxRedirects: 1, maxResponseBytes: 1024, timeoutMs: 1000 },
    );

    await assert.rejects(
      () => useCase.execute('https://cdn.example.com/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_HTTP_REDIRECT_LIMIT',
    );
    assert.equal(http.calls.length, 2);
  });

  it('rejects redirects into private address space after DNS', async () => {
    const http = new ScriptedHttp([
      {
        statusCode: 302,
        headers: { location: 'https://internal.example.com/secret' },
        body: new Uint8Array(),
      },
    ]);
    const useCase = new FetchSourceUrlSafely(
      new ValidateSourceUrl(
        new FakeDns({
          'cdn.example.com': ['93.184.216.34'],
          'internal.example.com': ['192.168.0.20'],
        }),
      ),
      http,
      { maxRedirects: 3, maxResponseBytes: 1024, timeoutMs: 1000 },
    );

    await assert.rejects(
      () => useCase.execute('https://cdn.example.com/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('returns body when response is not a redirect', async () => {
    const body = new TextEncoder().encode('#EXTM3U\n');
    const http = new ScriptedHttp([{ statusCode: 200, headers: {}, body }]);
    const useCase = new FetchSourceUrlSafely(
      new ValidateSourceUrl(
        new FakeDns({ 'cdn.example.com': ['93.184.216.34'] }),
      ),
      http,
      { maxRedirects: 3, maxResponseBytes: 1024, timeoutMs: 1000 },
    );

    const result = await useCase.execute('https://cdn.example.com/list.m3u');
    assert.equal(result.statusCode, 200);
    assert.equal(result.redirectCount, 0);
    assert.equal(new TextDecoder().decode(result.body), '#EXTM3U\n');
    assert.equal(http.calls[0]?.resolvedAddress, '93.184.216.34');
  });
});
