import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildXtreamPlayerApiUrl,
  buildXtreamStreamUrl,
  normalizeXtreamBaseUrl,
} from '../../src/domain/catalog/xtream-stream-url.js';

describe('xtream stream URL builders', () => {
  it('normalizes base URLs and strips player_api.php', () => {
    assert.equal(
      normalizeXtreamBaseUrl('https://panel.example.com:8080/'),
      'https://panel.example.com:8080',
    );
    assert.equal(
      normalizeXtreamBaseUrl('https://panel.example.com/player_api.php'),
      'https://panel.example.com',
    );
  });

  it('builds live, movie, and series stream URLs', () => {
    assert.equal(
      buildXtreamStreamUrl({
        baseUrl: 'https://panel.example.com',
        username: 'user',
        password: 'secret',
        kind: 'live',
        streamId: 10,
      }),
      'https://panel.example.com/live/user/secret/10.ts',
    );
    assert.equal(
      buildXtreamStreamUrl({
        baseUrl: 'https://panel.example.com',
        username: 'user',
        password: 'secret',
        kind: 'movie',
        streamId: '99',
        extension: 'mkv',
      }),
      'https://panel.example.com/movie/user/secret/99.mkv',
    );
    assert.equal(
      buildXtreamStreamUrl({
        baseUrl: 'https://panel.example.com',
        username: 'user',
        password: 'secret',
        kind: 'series',
        streamId: '55',
        extension: 'mp4',
      }),
      'https://panel.example.com/series/user/secret/55.mp4',
    );
  });

  it('builds player_api URLs with actions', () => {
    const url = buildXtreamPlayerApiUrl({
      baseUrl: 'https://panel.example.com',
      username: 'user',
      password: 'secret',
      action: 'get_live_streams',
      extraParams: { category_id: '1' },
    });
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/player_api.php');
    assert.equal(parsed.searchParams.get('username'), 'user');
    assert.equal(parsed.searchParams.get('action'), 'get_live_streams');
    assert.equal(parsed.searchParams.get('category_id'), '1');
  });
});
