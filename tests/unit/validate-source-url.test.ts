import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DnsResolver } from '../../src/application/ports/dns-resolver.js';
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

describe('ValidateSourceUrl', () => {
  it('accepts public DNS results', async () => {
    const useCase = new ValidateSourceUrl(
      new FakeDns({ 'cdn.example.com': ['93.184.216.34'] }),
    );
    const result = await useCase.execute('https://cdn.example.com/list.m3u');
    assert.equal(result.connectAddress, '93.184.216.34');
  });

  it('rejects when any resolved address is private', async () => {
    const useCase = new ValidateSourceUrl(
      new FakeDns({ 'evil.example.com': ['8.8.8.8', '10.0.0.1'] }),
    );
    await assert.rejects(
      () => useCase.execute('https://evil.example.com/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });

  it('rejects literal loopback URLs without trusting DNS', async () => {
    const useCase = new ValidateSourceUrl(new FakeDns({}));
    await assert.rejects(
      () => useCase.execute('http://127.0.0.1/playlist.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_ADDRESS_BLOCKED',
    );
  });
});
