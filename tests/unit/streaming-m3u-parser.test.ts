import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { M3uParseError } from '../../src/domain/catalog/m3u-parse-error.js';
import { parseM3uPlaylistStreaming } from '../../src/infrastructure/catalog/streaming-m3u-parser.js';

const SAMPLE = `#EXTM3U
#EXTINF:-1 tvg-id="ch1" tvg-name="One" tvg-logo="https://cdn.example/1.png" group-title="A",Channel One
https://stream.example/1.ts
#EXTINF:-1 tvg-id="bad" group-title="A",Missing URI
#EXTINF:-1 tvg-id="ch2" tvg-name="Two" group-title="B",Channel Two
https://stream.example/2.ts
not-a-uri-without-extinf
#EXTINF:-1 tvg-id="ch3" group-title="C",File blocked
file:///etc/passwd
`;

describe('parseM3uPlaylistStreaming', () => {
  it('parses EXTINF attributes and skips malformed rows', () => {
    const result = parseM3uPlaylistStreaming(Buffer.from(SAMPLE, 'utf8'));
    assert.equal(result.entries.length, 2);
    assert.equal(result.entries[0]?.tvgId, 'ch1');
    assert.equal(result.entries[0]?.tvgName, 'One');
    assert.equal(result.entries[0]?.tvgLogo, 'https://cdn.example/1.png');
    assert.equal(result.entries[0]?.groupTitle, 'A');
    assert.equal(result.entries[1]?.tvgId, 'ch2');
    assert.ok(result.stats.skippedLineCount >= 3);
    assert.equal(result.stats.encoding, 'utf-8');
  });

  it('decodes UTF-8 BOM playlists', () => {
    const body = Buffer.from(SAMPLE, 'utf8');
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
    const result = parseM3uPlaylistStreaming(withBom);
    assert.equal(result.entries.length, 2);
    assert.equal(result.stats.encoding, 'utf-8');
  });

  it('decodes UTF-16LE BOM playlists', () => {
    const text = `#EXTM3U
#EXTINF:-1 tvg-id="x" tvg-name="X" group-title="G",X
https://stream.example/x.ts
`;
    const withBom = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, 'utf16le'),
    ]);
    const result = parseM3uPlaylistStreaming(withBom);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0]?.tvgId, 'x');
    assert.equal(result.stats.encoding, 'utf-16le');
  });

  it('enforces entry and byte limits', () => {
    assert.throws(
      () =>
        parseM3uPlaylistStreaming(Buffer.from(SAMPLE, 'utf8'), {
          maxEntries: 1,
        }),
      (error: unknown) =>
        error instanceof M3uParseError && error.code === 'M3U_ENTRY_LIMIT',
    );

    assert.throws(
      () =>
        parseM3uPlaylistStreaming(Buffer.from(SAMPLE, 'utf8'), {
          maxBytes: 8,
        }),
      (error: unknown) =>
        error instanceof M3uParseError && error.code === 'M3U_BYTE_LIMIT',
    );
  });

  it('enforces max line length', () => {
    const long = `#EXTM3U
#EXTINF:-1,${'A'.repeat(100)}
https://stream.example/x.ts
`;
    assert.throws(
      () =>
        parseM3uPlaylistStreaming(Buffer.from(long, 'utf8'), {
          maxLineLength: 40,
        }),
      (error: unknown) =>
        error instanceof M3uParseError && error.code === 'M3U_LINE_LIMIT',
    );
  });
});
