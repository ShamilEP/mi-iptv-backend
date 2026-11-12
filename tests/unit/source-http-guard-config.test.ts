import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadSourceHttpGuardConfig } from '../../src/config/source-http-guard.js';

describe('loadSourceHttpGuardConfig', () => {
  it('returns defaults when env is unset', () => {
    const config = loadSourceHttpGuardConfig({});
    assert.equal(config.maxRedirects, 3);
    assert.equal(config.maxResponseBytes, 5 * 1024 * 1024);
    assert.equal(config.timeoutMs, 15_000);
  });

  it('reads bounded env overrides', () => {
    const config = loadSourceHttpGuardConfig({
      SOURCE_HTTP_MAX_REDIRECTS: '2',
      SOURCE_HTTP_MAX_RESPONSE_BYTES: '2048',
      SOURCE_HTTP_TIMEOUT_MS: '5000',
    });
    assert.deepEqual(config, {
      maxRedirects: 2,
      maxResponseBytes: 2048,
      timeoutMs: 5000,
    });
  });

  it('rejects out-of-range values', () => {
    assert.throws(() =>
      loadSourceHttpGuardConfig({ SOURCE_HTTP_MAX_REDIRECTS: '99' }),
    );
  });
});
