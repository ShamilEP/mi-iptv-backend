import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createIoredisRedisClientFromUrl,
  IoredisRedisClient,
} from '../../src/infrastructure/cache/ioredis-redis-client.js';

describe('IoredisRedisClient factory', () => {
  it('returns null when URL is missing', () => {
    assert.equal(createIoredisRedisClientFromUrl(undefined), null);
    assert.equal(createIoredisRedisClientFromUrl('  '), null);
  });

  it('builds a lazy client without connecting when URL is set', async () => {
    const client = createIoredisRedisClientFromUrl('redis://127.0.0.1:6379');
    assert.ok(client instanceof IoredisRedisClient);
    await client!.close();
  });
});
