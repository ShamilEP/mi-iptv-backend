import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ParseM3uPlaylist } from '../../src/application/catalog/parse-m3u-playlist.js';
import { M3uParseError } from '../../src/domain/catalog/m3u-parse-error.js';
import { IsolatedM3uPlaylistParser } from '../../src/infrastructure/catalog/isolated-m3u-playlist-parser.js';

const PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-id="iso" tvg-name="Isolated" tvg-logo="https://cdn.example/i.png" group-title="Test",Isolated Channel
https://stream.example/isolated.ts
`;

describe('IsolatedM3uPlaylistParser', () => {
  it('parses playlists inside a worker with resource limits', async () => {
    const useCase = new ParseM3uPlaylist(new IsolatedM3uPlaylistParser());
    const result = await useCase.execute(Buffer.from(PLAYLIST, 'utf8'), {
      timeoutMs: 10_000,
      maxOldGenerationSizeMb: 64,
    });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0]?.tvgId, 'iso');
    assert.equal(result.entries[0]?.groupTitle, 'Test');
  });

  it('surfaces byte-limit errors from the isolated worker path', async () => {
    const parser = new IsolatedM3uPlaylistParser({
      maxBytes: 16,
      maxEntries: 100,
      maxLineLength: 1024,
      timeoutMs: 5_000,
      maxOldGenerationSizeMb: 64,
    });
    await assert.rejects(
      () => parser.parse(Buffer.from(PLAYLIST, 'utf8')),
      (error: unknown) =>
        error instanceof M3uParseError && error.code === 'M3U_BYTE_LIMIT',
    );
  });
});
