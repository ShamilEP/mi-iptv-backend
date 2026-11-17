import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { AssertAccessTokenActive } from '../../src/application/auth/assert-access-token-active.js';
import { ApiRateLimitGuard } from '../../src/application/gateway/api-rate-limit-guard.js';
import {
  DEFAULT_API_RATE_LIMIT_ANONYMOUS_MAX_REQUESTS,
  DEFAULT_API_RATE_LIMIT_MAX_REQUESTS,
  loadApiGatewayConfig,
} from '../../src/config/api-gateway.js';
import { loadJwtTokenTtlConfig } from '../../src/config/jwt-tokens.js';
import { API_V1_PREFIX } from '../../src/domain/api/api-versioning.js';
import { InMemoryRedisClient } from '../../src/infrastructure/cache/in-memory-redis-client.js';
import { RedisAccessTokenDenyList } from '../../src/infrastructure/cache/redis-access-token-deny-list.js';
import { NodeRs256AccessTokenService } from '../../src/infrastructure/crypto/node-rs256-access-token-service.js';
import { EnvJwtSigningKeyStore } from '../../src/infrastructure/secrets/env-jwt-signing-key-store.js';
import { createApiGateway } from '../../src/presentation/http/gateway/api-gateway.js';
import { NodeHttpServer } from '../../src/presentation/http/node-http-server.js';

const docPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/backend/008-global-rate-limiting.md',
);

async function createStack(tokenMax: number, anonymousMax: number) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const access = new NodeRs256AccessTokenService(
    new EnvJwtSigningKeyStore({
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
      activeKid: 'be008',
    }),
    loadJwtTokenTtlConfig({}),
  );
  const redis = new InMemoryRedisClient();
  const gateway = createApiGateway({
    assertAccessTokenActive: new AssertAccessTokenActive(
      access,
      new RedisAccessTokenDenyList(redis),
    ),
    apiRateLimitGuard: new ApiRateLimitGuard(
      redis,
      tokenMax,
      anonymousMax,
      60,
    ),
    maxJsonBodyBytes: 1024,
  });
  return { access, gateway };
}

async function listen(
  gateway: ReturnType<typeof createApiGateway>,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const raw = http.createServer();
  await new Promise<void>((resolve, reject) => {
    raw.once('error', reject);
    raw.listen(0, '127.0.0.1', () => resolve());
  });
  const address = raw.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    raw.close((error) => (error ? reject(error) : resolve()));
  });

  const server = new NodeHttpServer(undefined, gateway);
  server.register({
    method: 'GET',
    path: `${API_V1_PREFIX}/ping`,
    handler: () => ({ statusCode: 200, body: { ok: true } }),
  });
  server.register({
    method: 'POST',
    path: `${API_V1_PREFIX}/auth/login`,
    auth: 'public',
    handler: () => ({ statusCode: 200, body: { ok: true } }),
  });
  await server.listen(port);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  };
}

describe('BE-008 global rate limiting', () => {
  it('defaults to 100/min token and stricter anonymous IP budget', () => {
    const config = loadApiGatewayConfig({});
    assert.equal(config.rateLimitMaxRequests, DEFAULT_API_RATE_LIMIT_MAX_REQUESTS);
    assert.equal(
      config.rateLimitAnonymousMaxRequests,
      DEFAULT_API_RATE_LIMIT_ANONYMOUS_MAX_REQUESTS,
    );
    assert.ok(config.rateLimitAnonymousMaxRequests < config.rateLimitMaxRequests);
    const doc = readFileSync(docPath, 'utf8');
    assert.match(doc, /100 req/);
    assert.match(doc, /X-RateLimit-Limit/);
  });

  it('emits X-RateLimit-* headers on authenticated responses and 429', async () => {
    const { access, gateway } = await createStack(2, 20);
    const issued = access.issue({
      accountId: randomUUID(),
      deviceId: randomUUID(),
      roles: ['user'],
    });
    const { baseUrl, close } = await listen(gateway);
    try {
      const headers = { authorization: `Bearer ${issued.token}` };
      const first = await fetch(`${baseUrl}${API_V1_PREFIX}/ping`, { headers });
      assert.equal(first.status, 200);
      assert.equal(first.headers.get('x-ratelimit-limit'), '2');
      assert.equal(first.headers.get('x-ratelimit-remaining'), '1');
      assert.ok(first.headers.get('x-ratelimit-reset'));

      await fetch(`${baseUrl}${API_V1_PREFIX}/ping`, { headers });
      const limited = await fetch(`${baseUrl}${API_V1_PREFIX}/ping`, {
        headers,
      });
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get('x-ratelimit-limit'), '2');
      assert.equal(limited.headers.get('x-ratelimit-remaining'), '0');
      assert.ok(limited.headers.get('retry-after'));
      assert.ok(limited.headers.get('x-ratelimit-reset'));
    } finally {
      await close();
    }
  });

  it('applies a stricter limit to unauthenticated endpoints', async () => {
    const { gateway } = await createStack(100, 2);
    const { baseUrl, close } = await listen(gateway);
    try {
      assert.equal(
        (await fetch(`${baseUrl}${API_V1_PREFIX}/auth/login`, { method: 'POST' }))
          .status,
        200,
      );
      assert.equal(
        (await fetch(`${baseUrl}${API_V1_PREFIX}/auth/login`, { method: 'POST' }))
          .status,
        200,
      );
      const limited = await fetch(`${baseUrl}${API_V1_PREFIX}/auth/login`, {
        method: 'POST',
      });
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get('x-ratelimit-limit'), '2');
      const body = (await limited.json()) as { code: string };
      assert.equal(body.code, 'API_RATE_LIMITED');
    } finally {
      await close();
    }
  });
});
