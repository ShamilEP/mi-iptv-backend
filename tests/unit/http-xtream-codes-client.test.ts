import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FetchXtreamCatalog } from '../../src/application/catalog/fetch-xtream-catalog.js';
import type { FetchSourceUrlSafely } from '../../src/application/sources/fetch-source-url-safely.js';
import { XtreamError } from '../../src/domain/catalog/xtream-error.js';
import { HttpXtreamCodesClient } from '../../src/infrastructure/catalog/http-xtream-codes-client.js';

function jsonBody(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function fakeSafeFetch(
  handler: (url: string) => unknown,
): FetchSourceUrlSafely {
  return {
    async execute(rawUrl: string) {
      return {
        finalUrl: rawUrl,
        statusCode: 200,
        body: jsonBody(handler(rawUrl)),
        redirectCount: 0,
      };
    },
  } as FetchSourceUrlSafely;
}

describe('HttpXtreamCodesClient', () => {
  const credentials = {
    baseUrl: 'https://panel.example.com',
    username: 'demo',
    password: 's3cret',
  };

  it('authenticates and fetches live, VOD, and series catalogs with stream URLs', async () => {
    const client = new HttpXtreamCodesClient(
      fakeSafeFetch((url) => {
        const parsed = new URL(url);
        const action = parsed.searchParams.get('action');
        if (action === null) {
          return {
            user_info: {
              auth: 1,
              status: 'Active',
              username: 'demo',
              exp_date: '1999999999',
              max_connections: '2',
              allowed_output_formats: ['m3u8', 'ts'],
            },
            server_info: { url: 'panel.example.com' },
          };
        }
        if (action === 'get_live_categories') {
          return [{ category_id: '1', category_name: 'News' }];
        }
        if (action === 'get_live_streams') {
          return [
            {
              stream_id: 10,
              name: 'News 24',
              category_id: '1',
              stream_icon: 'https://cdn.example/news.png',
              epg_channel_id: 'news24',
            },
          ];
        }
        if (action === 'get_vod_categories') {
          return [{ category_id: '2', category_name: 'Movies' }];
        }
        if (action === 'get_vod_streams') {
          return [
            {
              stream_id: 20,
              name: 'Demo Film',
              category_id: '2',
              stream_icon: null,
              container_extension: 'mp4',
            },
          ];
        }
        if (action === 'get_series_categories') {
          return [{ category_id: '3', category_name: 'Series' }];
        }
        if (action === 'get_series') {
          return [
            {
              series_id: 30,
              name: 'Demo Show',
              category_id: '3',
              cover: 'https://cdn.example/show.png',
            },
          ];
        }
        throw new Error(`Unexpected action ${action}`);
      }),
    );

    const catalog = await new FetchXtreamCatalog(client).execute(credentials);
    assert.equal(catalog.auth.status, 'active');
    assert.equal(catalog.liveCategories[0]?.categoryName, 'News');
    assert.equal(catalog.liveStreams[0]?.streamId, '10');
    assert.equal(
      catalog.liveStreams[0]?.streamUrl,
      'https://panel.example.com/live/demo/s3cret/10.ts',
    );
    assert.equal(catalog.vodStreams[0]?.streamId, '20');
    assert.equal(
      catalog.vodStreams[0]?.streamUrl,
      'https://panel.example.com/movie/demo/s3cret/20.mp4',
    );
    assert.equal(catalog.series[0]?.seriesId, '30');
  });

  it('maps expired panels to XTREAM_ACCOUNT_EXPIRED', async () => {
    const client = new HttpXtreamCodesClient(
      fakeSafeFetch(() => ({
        user_info: { auth: 1, status: 'Expired', exp_date: null },
      })),
    );
    await assert.rejects(
      () => client.authenticate(credentials),
      (error: unknown) =>
        error instanceof XtreamError && error.code === 'XTREAM_ACCOUNT_EXPIRED',
    );
  });

  it('maps blocked panels to XTREAM_ACCOUNT_BLOCKED', async () => {
    const client = new HttpXtreamCodesClient(
      fakeSafeFetch(() => ({
        user_info: { auth: 1, status: 'Banned', exp_date: null },
      })),
    );
    await assert.rejects(
      () => client.authenticate(credentials),
      (error: unknown) =>
        error instanceof XtreamError && error.code === 'XTREAM_ACCOUNT_BLOCKED',
    );
  });

  it('maps auth:0 to XTREAM_AUTH_FAILED', async () => {
    const client = new HttpXtreamCodesClient(
      fakeSafeFetch(() => ({
        user_info: { auth: 0, status: 'Active', exp_date: null },
      })),
    );
    await assert.rejects(
      () => client.authenticate(credentials),
      (error: unknown) =>
        error instanceof XtreamError && error.code === 'XTREAM_AUTH_FAILED',
    );
  });
});
