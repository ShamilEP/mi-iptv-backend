import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { M3uParseError } from '../../src/domain/catalog/m3u-parse-error.js';
import { XmltvParseError } from '../../src/domain/catalog/xmltv-parse-error.js';
import { parseM3uPlaylistStreaming } from '../../src/infrastructure/catalog/streaming-m3u-parser.js';
import { parseXmltvGuideStreaming } from '../../src/infrastructure/catalog/streaming-xmltv-parser.js';

const M3U_SEED = Buffer.from(
  `#EXTM3U
#EXTINF:-1 tvg-id="a" tvg-name="A" group-title="G",A
https://stream.example/a.ts
`,
  'utf8',
);

const XMLTV_SEED = Buffer.from(
  `<?xml version="1.0"?>
<tv>
  <channel id="c1"><display-name>C1</display-name></channel>
  <programme channel="c1" start="20260101120000 +0000" stop="20260101130000 +0000">
    <title>T</title>
  </programme>
</tv>
`,
  'utf8',
);

const FUZZ_ITERS = 64;

function mutate(seed: Uint8Array, round: number): Buffer {
  const out = Buffer.from(seed);
  const flips = 1 + (round % 7);
  for (let i = 0; i < flips; i += 1) {
    const index = (round * 17 + i * 31) % out.byteLength;
    out[index] = (out[index]! + round + i * 13) & 0xff;
  }
  if (round % 5 === 0) {
    return Buffer.concat([out, Buffer.alloc(64, round & 0xff)]);
  }
  if (round % 11 === 0) {
    return Buffer.concat([
      Buffer.from('<!DOCTYPE tv [<!ENTITY x "y">]>', 'utf8'),
      out,
    ]);
  }
  return out;
}

describe('SEC-032 parser fuzz (M3U + XMLTV)', () => {
  it('fuzzes M3U streaming parser without process crash', () => {
    let handled = 0;
    for (let i = 0; i < FUZZ_ITERS; i += 1) {
      const bytes = mutate(M3U_SEED, i);
      try {
        parseM3uPlaylistStreaming(bytes, {
          maxBytes: 256 * 1024,
          maxEntries: 500,
          maxLineLength: 4_096,
          timeoutMs: 1_000,
          maxOldGenerationSizeMb: 32,
        });
        handled += 1;
      } catch (error: unknown) {
        assert.ok(
          error instanceof M3uParseError,
          `unexpected non-M3uParseError at iter ${i}: ${String(error)}`,
        );
        handled += 1;
      }
    }
    assert.equal(handled, FUZZ_ITERS);
  });

  it('fuzzes XMLTV streaming parser without process crash', () => {
    let handled = 0;
    for (let i = 0; i < FUZZ_ITERS; i += 1) {
      const bytes = mutate(XMLTV_SEED, i);
      try {
        parseXmltvGuideStreaming(bytes, {
          maxBytes: 256 * 1024,
          maxChannels: 200,
          maxProgrammes: 500,
          maxLineLength: 4_096,
          timeoutMs: 1_000,
          maxOldGenerationSizeMb: 32,
        });
        handled += 1;
      } catch (error: unknown) {
        assert.ok(
          error instanceof XmltvParseError,
          `unexpected non-XmltvParseError at iter ${i}: ${String(error)}`,
        );
        handled += 1;
      }
    }
    assert.equal(handled, FUZZ_ITERS);
  });
});
