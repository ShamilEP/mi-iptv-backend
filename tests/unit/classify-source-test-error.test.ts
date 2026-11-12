import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifySourceTestError } from '../../src/application/sources/classify-source-test-error.js';
import { M3uParseError } from '../../src/domain/catalog/m3u-parse-error.js';
import { XtreamError } from '../../src/domain/catalog/xtream-error.js';
import { SsrfGuardError } from '../../src/domain/sources/ssrf-guard-error.js';

describe('classifySourceTestError', () => {
  it('maps timeout, unreachable, auth, and invalid playlist reasons', () => {
    assert.equal(
      classifySourceTestError(new SsrfGuardError('t', 'SOURCE_HTTP_TIMEOUT'))
        .reason,
      'timeout',
    );
    assert.equal(
      classifySourceTestError(new SsrfGuardError('u', 'SOURCE_HTTP_FAILED'))
        .reason,
      'unreachable',
    );
    assert.equal(
      classifySourceTestError(new XtreamError('a', 'XTREAM_AUTH_FAILED'))
        .reason,
      'auth_failed',
    );
    assert.equal(
      classifySourceTestError(new M3uParseError('p', 'M3U_PARSE_FAILED'))
        .reason,
      'invalid_playlist',
    );
  });
});
