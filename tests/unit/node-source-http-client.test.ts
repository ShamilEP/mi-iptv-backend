import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import { NodeSourceHttpClient } from '../../src/infrastructure/http/node-source-http-client.js';
import { SsrfGuardError } from '../../src/domain/sources/ssrf-guard-error.js';

describe('NodeSourceHttpClient', () => {
  it('rejects responses larger than maxResponseBytes', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('abcdefghij');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const port = address.port;
    const client = new NodeSourceHttpClient();

    try {
      await assert.rejects(
        () =>
          client.request({
            url: `http://example.com:${port}/playlist.m3u`,
            hostname: 'example.com',
            resolvedAddress: '127.0.0.1',
            timeoutMs: 2_000,
            maxResponseBytes: 4,
          }),
        (error: unknown) =>
          error instanceof SsrfGuardError &&
          error.code === 'SOURCE_HTTP_RESPONSE_TOO_LARGE',
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
