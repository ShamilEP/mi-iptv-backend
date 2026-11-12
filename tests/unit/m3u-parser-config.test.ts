import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadM3uParserLimits } from '../../src/config/m3u-parser.js';

describe('loadM3uParserLimits', () => {
  it('returns defaults when env is unset', () => {
    const limits = loadM3uParserLimits({});
    assert.equal(limits.maxBytes, 20 * 1024 * 1024);
    assert.equal(limits.maxEntries, 100_000);
    assert.equal(limits.timeoutMs, 30_000);
  });

  it('reads bounded env overrides', () => {
    const limits = loadM3uParserLimits({
      M3U_PARSER_MAX_BYTES: '4096',
      M3U_PARSER_MAX_ENTRIES: '10',
      M3U_PARSER_MAX_LINE_LENGTH: '512',
      M3U_PARSER_TIMEOUT_MS: '1000',
      M3U_PARSER_MAX_OLD_GEN_MB: '32',
    });
    assert.deepEqual(limits, {
      maxBytes: 4096,
      maxEntries: 10,
      maxLineLength: 512,
      timeoutMs: 1000,
      maxOldGenerationSizeMb: 32,
    });
  });
});
