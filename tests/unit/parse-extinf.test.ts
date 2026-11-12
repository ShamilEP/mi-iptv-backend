import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseExtInfLine } from '../../src/domain/catalog/parse-extinf.js';

describe('parseExtInfLine', () => {
  it('extracts tvg-* attributes and group-title', () => {
    const parsed = parseExtInfLine(
      '#EXTINF:-1 tvg-id="espn.us" tvg-name="ESPN" tvg-logo="https://cdn.example/espn.png" group-title="Sports",ESPN HD',
    );
    assert.deepEqual(parsed, {
      tvgId: 'espn.us',
      tvgName: 'ESPN',
      tvgLogo: 'https://cdn.example/espn.png',
      groupTitle: 'Sports',
      title: 'ESPN HD',
      durationSec: -1,
    });
  });

  it('tolerates single-quoted and unquoted attributes', () => {
    const parsed = parseExtInfLine(
      "#EXTINF:0 tvg-id='a1' group-title=News,Channel One",
    );
    assert.equal(parsed?.tvgId, 'a1');
    assert.equal(parsed?.groupTitle, 'News');
    assert.equal(parsed?.title, 'Channel One');
    assert.equal(parsed?.durationSec, 0);
  });

  it('returns null for non-EXTINF lines', () => {
    assert.equal(parseExtInfLine('#EXTM3U'), null);
  });
});
