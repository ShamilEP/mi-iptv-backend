import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { XmltvParseError } from '../../src/domain/catalog/xmltv-parse-error.js';
import { parseXmltvGuideStreaming } from '../../src/infrastructure/catalog/streaming-xmltv-parser.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="news"><display-name>News 24</display-name></channel>
  <programme channel="news" start="20260101120000 +0000" stop="20260101130000 +0000">
    <title>Midday</title>
  </programme>
</tv>
`;

describe('parseXmltvGuideStreaming', () => {
  it('extracts channels and programmes', () => {
    const result = parseXmltvGuideStreaming(Buffer.from(SAMPLE, 'utf8'));
    assert.equal(result.channels.length, 1);
    assert.equal(result.channels[0]?.id, 'news');
    assert.equal(result.channels[0]?.displayName, 'News 24');
    assert.equal(result.programmes.length, 1);
    assert.equal(result.programmes[0]?.title, 'Midday');
  });

  it('rejects DTD / ENTITY declarations', () => {
    const evil = `<!DOCTYPE tv [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><tv></tv>`;
    assert.throws(
      () => parseXmltvGuideStreaming(Buffer.from(evil, 'utf8')),
      (error: unknown) =>
        error instanceof XmltvParseError &&
        error.code === 'XMLTV_FORBIDDEN_DTD',
    );
  });

  it('enforces size and programme caps', () => {
    assert.throws(
      () =>
        parseXmltvGuideStreaming(Buffer.from(SAMPLE, 'utf8'), {
          maxBytes: 8,
        }),
      (error: unknown) =>
        error instanceof XmltvParseError && error.code === 'XMLTV_BYTE_LIMIT',
    );
    assert.throws(
      () =>
        parseXmltvGuideStreaming(Buffer.from(SAMPLE, 'utf8'), {
          maxProgrammes: 0,
        }),
      (error: unknown) =>
        error instanceof XmltvParseError &&
        error.code === 'XMLTV_PROGRAMME_LIMIT',
    );
  });
});
