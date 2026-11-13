import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ParseXmltvGuide } from '../../src/application/catalog/parse-xmltv-guide.js';
import { XmltvParseError } from '../../src/domain/catalog/xmltv-parse-error.js';
import { IsolatedXmltvGuideParser } from '../../src/infrastructure/catalog/isolated-xmltv-guide-parser.js';

const SAMPLE = `<?xml version="1.0"?>
<tv>
  <channel id="iso"><display-name>Isolated</display-name></channel>
  <programme channel="iso" start="20260101120000 +0000" stop="20260101130000 +0000">
    <title>Show</title>
  </programme>
</tv>
`;

describe('IsolatedXmltvGuideParser', () => {
  it('parses guides inside a worker with resource limits', async () => {
    const useCase = new ParseXmltvGuide(new IsolatedXmltvGuideParser());
    const result = await useCase.execute(Buffer.from(SAMPLE, 'utf8'), {
      timeoutMs: 10_000,
      maxOldGenerationSizeMb: 64,
    });
    assert.equal(result.channels.length, 1);
    assert.equal(result.programmes[0]?.title, 'Show');
  });

  it('surfaces byte-limit errors from the isolated path', async () => {
    const parser = new IsolatedXmltvGuideParser({
      maxBytes: 16,
      maxChannels: 10,
      maxProgrammes: 10,
      maxLineLength: 1024,
      timeoutMs: 5_000,
      maxOldGenerationSizeMb: 64,
    });
    await assert.rejects(
      () => parser.parse(Buffer.from(SAMPLE, 'utf8')),
      (error: unknown) =>
        error instanceof XmltvParseError && error.code === 'XMLTV_BYTE_LIMIT',
    );
  });
});
