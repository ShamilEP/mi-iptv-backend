import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SsrfGuardError } from '../../src/domain/sources/ssrf-guard-error.js';
import {
  parseSourceUrl,
  resolveSourceRedirectUrl,
} from '../../src/domain/sources/source-url.js';

describe('parseSourceUrl', () => {
  it('allows http and https only', () => {
    assert.equal(
      parseSourceUrl('https://cdn.example.com/list.m3u').protocol,
      'https:',
    );
    assert.equal(
      parseSourceUrl('http://cdn.example.com/list.m3u').protocol,
      'http:',
    );
  });

  it('rejects non-http schemes', () => {
    assert.throws(
      () => parseSourceUrl('file:///etc/passwd'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_SCHEME_FORBIDDEN',
    );
    assert.throws(
      () => parseSourceUrl('ftp://cdn.example.com/list.m3u'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_SCHEME_FORBIDDEN',
    );
  });

  it('rejects metadata hostnames', () => {
    assert.throws(
      () => parseSourceUrl('http://metadata.google.internal/latest'),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_HOST_BLOCKED',
    );
  });
});

describe('resolveSourceRedirectUrl', () => {
  it('resolves relative redirects against the current URL', () => {
    const next = resolveSourceRedirectUrl(
      'https://cdn.example.com/a/list.m3u',
      '/b/next.m3u',
    );
    assert.equal(next.href, 'https://cdn.example.com/b/next.m3u');
  });

  it('rejects redirects to forbidden schemes', () => {
    assert.throws(
      () =>
        resolveSourceRedirectUrl(
          'https://cdn.example.com/list.m3u',
          'file:///tmp/x',
        ),
      (error: unknown) =>
        error instanceof SsrfGuardError &&
        error.code === 'SOURCE_URL_SCHEME_FORBIDDEN',
    );
  });
});
